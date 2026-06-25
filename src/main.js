const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { detectDeathStranding, listAllSteamGames } = require("./gameDetector");

// Назва патч-архіву, в який Decima пише українізовані .core файли.
// На Steam/EGS файл лежить у data\ і існує оригінальним.
// На Xbox Game Pass файл лежить у packed_GDK\ і створюється з нуля.
const PATCH_ARCHIVE_NAME = "59b95a781c9170b0d13773766e27ad90.bin";
// Відносний шлях до локалізованого .bin (Steam/EGS: лежить у data\).
const LOCALIZED_BIN_RELATIVE = path.join("data", PATCH_ARCHIVE_NAME);
const BACKUP_SUFFIX = ".bak";

/**
 * Xbox Game Pass-теки мають packed_GDK\ замість data\.
 * Перевіряємо за наявністю packed_GDK як основного маркера.
 */
function isXboxGameDir(gameDir) {
  return fs.existsSync(path.join(gameDir, "packed_GDK"));
}

/**
 * Створити junction `data` → `packed_GDK` у теці Xbox-гри.
 * Це дозволяє Decima Workshop та решті коду використовувати шлях
 * data\<archive>.bin без додаткових змін. Використовуємо нативний
 * fs.symlinkSync('junction'), щоб коректно працювали шляхи з пробілами.
 */
function ensureXboxDataJunction(gameDir) {
  const dataPath = path.join(gameDir, "data");
  const packedPath = path.join(gameDir, "packed_GDK");

  if (fs.existsSync(dataPath)) {
    console.log("data\\ already exists, skipping junction creation");
    return;
  }

  console.log(`Creating junction: ${dataPath} -> ${packedPath}`);
  try {
    fs.symlinkSync(packedPath, dataPath, "junction");
    console.log("Junction created successfully");
  } catch (err) {
    throw new Error(
      `Не вдалося створити junction data → packed_GDK. ` +
      `Запустіть українізатор від імені адміністратора. ` +
      `Деталі: ${err.message}`
    );
  }
}

let mainWindow;

// Створення головного вікна
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 670,
    height: 514,
    resizable: false,
    autoHideMenuBar: true, // Приховати меню
    title: "Українізатор Death Stranding", // Назва вікна
    icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false, // Безпека
      contextIsolation: true, // Безпека
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setMenuBarVisibility(false); // Повністю вимкнути меню
}

// Розбір аргументів командного рядка (інтеграція зі сторонніми лаунчерами).
// Реагує на /uninstall (action), сумісно з форматом, який передає
// littlebit-launcher: ["/uninstall", "/SILENT", "/silent"]. Прапор /silent
// ігнорується (деінсталяція через CLI і так виконується без UI).
// Опціонально приймає шлях до теки гри як позиційний аргумент.
function parseCliArgs() {
  // У запакованому застосунку argv = [exe, ...args], у dev = [electron, script, ...args]
  const rawArgs = process.argv.slice(app.isPackaged ? 1 : 2);

  let uninstall = false;
  let gameDir = null;

  for (const arg of rawArgs) {
    const flag = arg.toLowerCase().replace(/^--/, '/');
    if (flag === '/uninstall') {
      uninstall = true;
    } else if (!arg.startsWith('/') && !arg.startsWith('--')) {
      // Позиційний аргумент — шлях до теки гри
      try {
        if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
          gameDir = arg;
        }
      } catch {
        // ігноруємо некоректні шляхи
      }
    }
  }

  return { uninstall, gameDir };
}

// Визначити теку гри для тихої деінсталяції, якщо її не передали аргументом.
// Перебирає обидві версії та обирає ту, де реально є бекап для відновлення.
async function resolveUninstallGameDir() {
  for (const version of ['dc', 'ds']) {
    try {
      const result = await detectDeathStranding(version);
      if (result && result.path) {
        // Xbox: встановлено = є патч у packed_GDK\ (бекапу не буває).
        // Steam/EGS: встановлено = є .bak для відновлення оригіналу.
        const installed = isXboxGameDir(result.path)
          ? fs.existsSync(path.join(result.path, 'packed_GDK', PATCH_ARCHIVE_NAME))
          : fs.existsSync(path.join(result.path, LOCALIZED_BIN_RELATIVE) + BACKUP_SUFFIX);
        if (installed) {
          return result.path;
        }
      }
    } catch (error) {
      console.error(`Detection error for ${version}:`, error.message);
    }
  }
  return null;
}

// Тиха деінсталяція через CLI. Повертає код виходу (0 — успіх, 1 — помилка).
async function runCliUninstall(cli) {
  try {
    let gameDir = cli.gameDir;
    if (!gameDir) {
      console.log('No game directory provided, auto-detecting...');
      gameDir = await resolveUninstallGameDir();
    }

    if (!gameDir) {
      console.error('Game with installed localization not found.');
      return 1;
    }

    uninstallLocalizationAtPath(gameDir);
    return 0;
  } catch (error) {
    console.error('CLI uninstall failed:', error.message);
    return 1;
  }
}

app.whenReady().then(async () => {
  const cli = parseCliArgs();

  if (cli.uninstall) {
    // Режим інтеграції з лаунчером: виконати деінсталяцію без UI та вийти
    const exitCode = await runCliUninstall(cli);
    app.exit(exitCode);
    return;
  }

  createWindow();
});

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

// Перевірка чи встановлено українізацію
// На Steam/EGS — за наявністю .bak (оригінал зберігається поруч).
// На Xbox Game Pass — за наявністю самого патч-архіву в packed_GDK\,
// бо цей файл не існує в оригінальній установці.
ipcMain.handle("check-backup", async (event, gameDir) => {
  if (isXboxGameDir(gameDir)) {
    const patchPath = path.join(gameDir, 'packed_GDK', PATCH_ARCHIVE_NAME);
    const installed = fs.existsSync(patchPath);
    console.log('Xbox patch archive exists:', installed);
    return installed;
  }

  const backupPath = path.join(gameDir, 'data', PATCH_ARCHIVE_NAME + '.bak');
  console.log('Checking for backup at:', backupPath);
  const hasBackup = fs.existsSync(backupPath);
  console.log('Backup exists:', hasBackup);
  return hasBackup;
});

// Спільна логіка деінсталяції.
// Steam/EGS — відновити оригінал з .bak.
// Xbox Game Pass — просто видалити патч-архів у packed_GDK\ (оригіналу не було).
function uninstallLocalizationAtPath(gameDir) {
  console.log('Uninstalling localization from:', gameDir);

  if (isXboxGameDir(gameDir)) {
    const patchPath = path.join(gameDir, 'packed_GDK', PATCH_ARCHIVE_NAME);
    if (!fs.existsSync(patchPath)) {
      throw new Error('Файл українізації не знайдено в packed_GDK.');
    }
    console.log('Removing Xbox patch archive:', patchPath);
    fs.unlinkSync(patchPath);

    // Прибрати junction data → packed_GDK, щоб тека повернулась у початковий стан.
    // Видаляємо лише якщо це справді junction (а не реальна тека).
    const dataJunction = path.join(gameDir, 'data');
    try {
      if (fs.existsSync(dataJunction) && fs.lstatSync(dataJunction).isSymbolicLink()) {
        fs.rmdirSync(dataJunction);
        console.log('Removed data junction');
      }
    } catch (err) {
      console.warn('Could not remove data junction:', err.message);
    }

    console.log('Xbox localization uninstalled successfully!');
    return;
  }

  const binPath = path.join(gameDir, LOCALIZED_BIN_RELATIVE);
  const backupPath = binPath + BACKUP_SUFFIX;

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
}

// Деінсталяція українізації (відновлення оригіналу)
ipcMain.handle("uninstall-localization", async (event, gameDir) => {
  try {
    uninstallLocalizationAtPath(gameDir);
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
    let decimaScript = isWindows
      ? path.join(decimaDir, "decima-cli.exe")
      : path.join(decimaDir, "bin", "decima");

    // Створити тимчасову папку (потрібна і для Sources, і можливо для Decima)
    const os = require('os');
    const fs = require('fs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-localizer-'));

    // On Linux, ensure the decima script is executable
    if (!isWindows) {
      try {
        fs.chmodSync(decimaScript, 0o755);
        console.log('Set executable permissions for decima script');
      } catch (error) {
        // Read-only filesystem (FUSE-mounted AppImage) — copy Decima to temp
        console.log('Read-only FS, copying Decima to temp directory...');
        const tmpDecima = path.join(tmpDir, 'Decima');
        await copyDirectoryRecursive(decimaDir, tmpDecima);
        decimaScript = path.join(tmpDecima, "bin", "decima");
        fs.chmodSync(decimaScript, 0o755);
        console.log('Decima copied to temp, executable permissions set');
      }
    }

    const localizationFile =
      gameVersion === "dc"
        ? path.join(localizationDir, "localization.json")
        : path.join(localizationDir, "localization_ds_not_dc.json");
    const workingSourcesDir = path.join(tmpDir, 'Sources');

    // Xbox Game Pass-теки використовують packed_GDK\ замість data\.
    // Створюємо junction data → packed_GDK один раз, далі решта коду
    // (Decima, шляхи до .bin) працює як зі Steam-структурою.
    const isXbox = isXboxGameDir(gameDir);
    if (isXbox) {
      console.log('Xbox Game Pass install detected, preparing data junction...');
      await ensureXboxDataJunction(gameDir);
    }

    console.log('Game directory:', gameDir);
    console.log('Platform layout:', isXbox ? 'Xbox Game Pass' : 'Steam/EGS');
    console.log('Decima script:', decimaScript);
    console.log('Localization file:', localizationFile);
    console.log('Original Sources directory:', sourcesDir);
    console.log('Working Sources directory:', workingSourcesDir);

    // На Linux: підмінити Windows Oodle DLL на Linux .so
    // (Decima шукає oo2core_7_win64.dll, а dlopen() перевіряє ELF-заголовок, не розширення)
    let oodleBackupPath = null;
    let oodleDllPath = null;

    if (!isWindows) {
      const gameOodleDll = path.join(gameDir, "oo2core_7_win64.dll");
      const oodleLinuxLib = path.join(decimaDir, "liboodle-linux.so");

      if (fs.existsSync(gameOodleDll) && fs.existsSync(oodleLinuxLib)) {
        oodleDllPath = gameOodleDll;
        oodleBackupPath = gameOodleDll + ".linux-bak";
        console.log('Swapping Windows Oodle DLL with Linux .so...');
        fs.renameSync(gameOodleDll, oodleBackupPath);
        fs.copyFileSync(oodleLinuxLib, gameOodleDll);
        console.log('Oodle library swapped for Linux');
      }
    }

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

      const binPath = path.join(gameDir, "data", PATCH_ARCHIVE_NAME);
      const backupPath = path.join(gameDir, "data", PATCH_ARCHIVE_NAME + ".bak");

      if (isXbox) {
        // На Xbox оригінального файлу не існує: репак створює його з нуля.
        // На реінсталі видаляємо попередній патч, щоб Decima почала з порожнього архіву.
        if (fs.existsSync(binPath)) {
          console.log('Existing Xbox patch found, removing before reinstall...');
          fs.unlinkSync(binPath);
        }
        // Бекап не потрібен — uninstall видаляє патч-файл і повертає теку у початковий стан.
      } else {
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
      // Відновити оригінальний Oodle DLL
      if (oodleBackupPath && oodleDllPath) {
        try {
          if (fs.existsSync(oodleDllPath)) fs.unlinkSync(oodleDllPath);
          fs.renameSync(oodleBackupPath, oodleDllPath);
          console.log('Original Oodle DLL restored');
        } catch (restoreError) {
          console.error('Warning: Could not restore Oodle DLL:', restoreError.message);
        }
      }

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
