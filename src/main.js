const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const { detectDeathStranding, listAllSteamGames } = require("./gameDetector");

let mainWindow;

// Створення головного вікна
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 670,
    height: 514,
    resizable: false,
    autoHideMenuBar: true, // Приховати меню
    title: "Українізатор Death Stranding", // Назва вікна
    icon: path.join(__dirname, "..", "build", "icon.ico"), // Використати кастомну іконку
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false, // Безпека
      contextIsolation: true, // Безпека
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setMenuBarVisibility(false); // Повністю вимкнути меню
}

app.whenReady().then(createWindow);

// Закрити додаток коли всі вікна закриті (крім macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Auto-detect game path
ipcMain.handle("detect-game-path", async (event, gameVersion) => {
  try {
    // Temporarily enable diagnostics to help debug
    process.env.DEBUG = 'true';

    const result = detectDeathStranding(gameVersion);
    return result;
  } catch (error) {
    console.error("Auto-detection error:", error);
    console.error(error.stack);
    return null;
  }
});

// Вибір директорії гри
ipcMain.handle("select-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Виберіть теку з грою",
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Перевірка наявності бекапу
ipcMain.handle("check-backup", async (event, gameDir) => {
  const fs = require('fs');
  const backupPath = path.join(gameDir, 'data', '59b95a781c9170b0d13773766e27ad90.bin.bak');

  console.log('Checking for backup at:', backupPath);
  const hasBackup = fs.existsSync(backupPath);
  console.log('Backup exists:', hasBackup);

  return hasBackup;
});

// Деінсталяція українізації (відновлення оригіналу)
ipcMain.handle("uninstall-localization", async (event, gameDir) => {
  const fs = require('fs');

  try {
    const binPath = path.join(gameDir, 'data', '59b95a781c9170b0d13773766e27ad90.bin');
    const backupPath = path.join(gameDir, 'data', '59b95a781c9170b0d13773766e27ad90.bin.bak');

    console.log('Uninstalling localization...');
    console.log('Binary path:', binPath);
    console.log('Backup path:', backupPath);

    // Перевірити чи існує бекап
    if (!fs.existsSync(backupPath)) {
      throw new Error('Файл бекапу не знайдено. Неможливо відновити оригінал.');
    }

    // Видалити поточний .bin файл (з перекладом)
    if (fs.existsSync(binPath)) {
      console.log('Removing localized file...');
      fs.unlinkSync(binPath);
    }

    // Перейменувати .bak на .bin (відновити оригінал)
    console.log('Restoring original file from backup...');
    fs.renameSync(backupPath, binPath);

    console.log('Localization uninstalled successfully!');
    return { success: true };
  } catch (error) {
    console.error('Uninstall error:', error);
    return { success: false, error: error.message };
  }
});

// Головна функція українізації
ipcMain.handle("install-localization", async (event, options) => {
  const { gameVersion, gameDir, createBackup } = options;

  try {
    // Отримати шляхи до ресурсів
    // В режимі розробки використовуємо теку проекту, в продакшені - process.resourcesPath
    const isDev = !app.isPackaged;
    const isWindows = process.platform === "win32";

    let resourcesPath;
    if (isDev) {
      resourcesPath = path.join(__dirname, "..");
    } else {
      // В portable режимі ресурси знаходяться поруч з exe
      resourcesPath = path.dirname(process.execPath);
    }

    // В режимі розробки використовуємо платформо-специфічну папку Decima
    const decimaDirName = isDev
      ? (isWindows ? "Decima_win" : "Decima_linux")
      : "Decima"; // В продакшені electron-builder автоматично копіює правильну версію

    const decimaDir = path.join(resourcesPath, "resources", decimaDirName);
    const localizationDir = path.join(resourcesPath, "resources", "Localization");
    const sourcesDir = path.join(resourcesPath, "resources", "Sources");
    const sourcesDCOnlyDir = path.join(resourcesPath, "resources", "Sources_DSDC_Only");

    console.log('Resources path:', resourcesPath);
    console.log('Decima directory:', decimaDir);

    // Вибрати правильний скрипт
    // New version uses decima-cli.exe (native executable, no Java needed)
    const decimaScript = isWindows
      ? path.join(decimaDir, "decima-cli.exe")
      : path.join(decimaDir, "bin", "decima");

    // On Linux, ensure the decima script is executable
    if (!isWindows) {
      try {
        const fs = require('fs');
        fs.chmodSync(decimaScript, 0o755);
        console.log('Set executable permissions for decima script');
      } catch (error) {
        console.error('Warning: Could not set executable permissions:', error.message);
      }
    }

    const localizationFile =
      gameVersion === "dc"
        ? path.join(localizationDir, "localization.json")
        : path.join(localizationDir, "localization_ds_not_dc.json");

    // Створити тимчасову папку для Sources (AppImage read-only, треба копіювати)
    const os = require('os');
    const fs = require('fs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-localizer-'));
    const workingSourcesDir = path.join(tmpDir, 'Sources');

    console.log('Game directory:', gameDir);
    console.log('Decima script:', decimaScript);
    console.log('Localization file:', localizationFile);
    console.log('Original Sources directory:', sourcesDir);
    console.log('Working Sources directory:', workingSourcesDir);

    try {
      // Скопіювати Sources в тимчасову папку
      console.log('Copying base Sources to temp directory...');
      await copyDirectoryRecursive(sourcesDir, workingSourcesDir);

      // Якщо обрана версія DC, додати файли з Sources_DSDC_Only
      if (gameVersion === "dc") {
        if (fs.existsSync(sourcesDCOnlyDir)) {
          console.log('Copying DC-specific files from:', sourcesDCOnlyDir);
          await copyDirectoryRecursive(sourcesDCOnlyDir, workingSourcesDir);
          console.log('DC-specific files copied successfully');
        } else {
          console.warn('Sources_DSDC_Only directory not found:', sourcesDCOnlyDir);
        }
      }

      const binPath = path.join(gameDir, "data", "59b95a781c9170b0d13773766e27ad90.bin");
      const backupPath = path.join(gameDir, "data", "59b95a781c9170b0d13773766e27ad90.bin.bak");

      // Якщо бекап вже існує — відновити оригінал перед встановленням
      if (fs.existsSync(backupPath)) {
        console.log('Existing backup found, restoring original before reinstall...');
        if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
        fs.renameSync(backupPath, binPath);
        console.log('Original restored from backup.');
      }

      // Зробити бекап власноруч (до Decima), щоб контролювати ім'я файлу
      if (createBackup) {
        console.log('Creating backup...');
        fs.copyFileSync(binPath, backupPath);
        console.log('Backup created:', backupPath);
      }

      // Перша команда: localization import
      await executeCommand(decimaScript, [
        "localization",
        "import",
        `--project=${gameDir}`,
        `--input=${localizationFile}`,
        `--output=${workingSourcesDir}`,
      ]);

      // Друга команда: repack (без --backup, бо ми вже зробили бекап самі)
      console.log('Binary path:', binPath);
      await executeCommand(decimaScript, [
        "repack",
        "--level=NONE",
        `--project=${gameDir}`,
        binPath,
        workingSourcesDir,
      ]);

      return { success: true };
    } finally {
      // Видалити тимчасову папку
      try {
        const fsPromises = require('fs').promises;
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
        console.log('Temporary directory cleaned up:', tmpDir);
      } catch (cleanupError) {
        console.warn('Could not clean up temporary directory:', cleanupError.message);
      }
    }
  } catch (error) {
    console.error("Помилка:", error);
    return { success: false, error: error.message };
  }
});

// Рекурсивне копіювання директорії
async function copyDirectoryRecursive(source, destination) {
  const fs = require('fs').promises;
  const fsSync = require('fs');
  const pathModule = require('path');

  // Створити цільову директорію якщо не існує
  if (!fsSync.existsSync(destination)) {
    await fs.mkdir(destination, { recursive: true });
  }

  // Прочитати всі файли та папки в source
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = pathModule.join(source, entry.name);
    const destPath = pathModule.join(destination, entry.name);

    if (entry.isDirectory()) {
      // Рекурсивно скопіювати піддиректорію
      await copyDirectoryRecursive(sourcePath, destPath);
    } else {
      // Скопіювати файл
      await fs.copyFile(sourcePath, destPath);
      console.log(`Copied: ${sourcePath} -> ${destPath}`);
    }
  }
}

// Допоміжна функція для виконання команд (точно як у Python subprocess.run)
function executeCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log('Executing:', command, args);

    // IMPORTANT: shell: false to prevent argument splitting on spaces
    // Node.js spawn with shell: true splits arguments incorrectly
    const childProcess = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"], // ignore stdin to prevent console window
      windowsHide: true // Hide console window on Windows
    });

    let stdout = "";
    let stderr = "";

    childProcess.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });

    childProcess.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    childProcess.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Команда завершилась з кодом ${code}: ${stderr}`));
      }
    });

    childProcess.on("error", (err) => {
      reject(err);
    });
  });
}
