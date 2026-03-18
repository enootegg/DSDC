const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get all available drives on Windows
 */
function getWindowsDrives() {
  const drives = [];
  // Check drives from A to Z
  for (let i = 65; i <= 90; i++) {
    const drive = String.fromCharCode(i) + ':';
    try {
      if (fs.existsSync(drive + '\\')) {
        drives.push(drive);
      }
    } catch (e) {
      // Drive doesn't exist or not accessible
    }
  }
  return drives;
}

/**
 * Get Steam installation path from Windows Registry
 */
async function getSteamPathFromRegistry() {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const regedit = require('regedit').promisified;

    // Try 64-bit registry first (most common)
    const registryPaths = [
      'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
      'HKLM\\SOFTWARE\\Valve\\Steam'
    ];

    for (const regPath of registryPaths) {
      try {
        const result = await regedit.list(regPath);
        const steamData = result[regPath];

        if (steamData && steamData.values && steamData.values.InstallPath) {
          const installPath = steamData.values.InstallPath.value;
          if (installPath && fs.existsSync(installPath)) {
            console.log('Found Steam via Registry:', installPath);
            return installPath;
          }
        }
      } catch (err) {
        // Try next registry path
        continue;
      }
    }
  } catch (error) {
    console.error('Error reading Registry:', error.message);
  }

  return null;
}

/**
 * Search for Steam installation recursively on all drives (fallback)
 */
function findSteamOnDrives() {
  console.log('Searching for Steam on all drives...');

  const drives = getWindowsDrives();
  const commonPaths = [
    'Program Files (x86)\\Steam',
    'Program Files\\Steam',
    'Steam',
    'Games\\Steam',
    'SteamLibrary'
  ];

  for (const drive of drives) {
    for (const commonPath of commonPaths) {
      const testPath = path.join(drive + '\\', commonPath);

      // Check if it's a valid Steam installation
      const steamAppsPath = path.join(testPath, 'steamapps');
      const configPath = path.join(testPath, 'config');

      if (fs.existsSync(steamAppsPath) && fs.existsSync(configPath)) {
        console.log('Found Steam installation at:', testPath);
        return testPath;
      }
    }
  }

  return null;
}

/**
 * Search for standalone Steam libraries (when main Steam install not found)
 * This handles cases where games are in non-standard locations
 */
function findStandaloneSteamLibraries() {
  console.log('Searching for standalone Steam libraries...');
  const libraries = [];

  if (process.platform !== 'win32') {
    return libraries;
  }

  const drives = getWindowsDrives();
  const commonLibraryPaths = [
    'SteamLibrary\\steamapps',
    'Games\\Steam\\SteamLibrary\\steamapps',
    'Steam\\SteamLibrary\\steamapps',
    'Games\\SteamLibrary\\steamapps'
  ];

  for (const drive of drives) {
    for (const libPath of commonLibraryPaths) {
      const testPath = path.join(drive + '\\', libPath);

      if (fs.existsSync(testPath)) {
        const commonPath = path.join(testPath, 'common');
        if (fs.existsSync(commonPath)) {
          console.log('Found standalone Steam library at:', testPath);
          libraries.push(testPath);
        }
      }
    }
  }

  return libraries;
}

/**
 * Find Steam libraries on SD cards (Steam Deck)
 */
function findSteamDeckSDLibraries() {
  const libraries = [];

  if (process.platform !== 'linux') {
    return libraries;
  }

  // Check for SD cards in /run/media/
  const mediaPath = '/run/media';

  try {
    if (!fs.existsSync(mediaPath)) {
      return libraries;
    }

    // Read all mounted media (includes deck/UUID folders and old mmcblk0p1)
    const mediaFolders = fs.readdirSync(mediaPath);

    for (const folder of mediaFolders) {
      const folderPath = path.join(mediaPath, folder);

      try {
        const stat = fs.statSync(folderPath);
        if (!stat.isDirectory()) continue;

        // Check if this folder has subfolders (for /run/media/deck/UUID structure)
        const subFolders = fs.readdirSync(folderPath);

        for (const subFolder of subFolders) {
          const potentialSteamPath = path.join(folderPath, subFolder, 'steamapps');

          if (fs.existsSync(potentialSteamPath)) {
            console.log('Found Steam Deck SD library:', potentialSteamPath);
            libraries.push(potentialSteamPath);
          }
        }

        // Also check direct path (for old mmcblk0p1 structure)
        const directSteamPath = path.join(folderPath, 'steamapps');
        if (fs.existsSync(directSteamPath) && !libraries.includes(directSteamPath)) {
          console.log('Found Steam Deck SD library (direct):', directSteamPath);
          libraries.push(directSteamPath);
        }
      } catch (err) {
        // Skip folders we can't read
        continue;
      }
    }
  } catch (error) {
    console.error('Error searching for SD card libraries:', error.message);
  }

  return libraries;
}

/**
 * Find all Steam libraries
 */
async function getSteamLibraries() {
  const libraries = [];

  // First, try to get Steam path from Registry (most reliable on Windows)
  let steamPath = await getSteamPathFromRegistry();

  // Fallback to common paths if Registry fails
  if (!steamPath) {
    if (process.platform === 'win32') {
      // Try standard Windows paths
      const possibleSteamPaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam')
      ];

      for (const testPath of possibleSteamPaths) {
        const steamAppsPath = path.join(testPath, 'steamapps');
        if (fs.existsSync(steamAppsPath)) {
          steamPath = testPath;
          console.log('Found Steam at fallback path:', steamPath);
          break;
        }
      }

      // Last resort: search all drives
      if (!steamPath) {
        steamPath = findSteamOnDrives();
      }
    } else {
      // Linux/Mac paths
      const possibleSteamPaths = [
        // Standard Linux paths
        path.join(os.homedir(), '.local', 'share', 'Steam'),
        path.join(os.homedir(), '.steam', 'steam'),
        path.join(os.homedir(), '.steam', 'root'),
        // Steam Deck specific
        '/home/deck/.local/share/Steam',
        '/home/deck/.steam/steam',
        // System-wide
        '/usr/share/steam',
        '/usr/local/share/steam',
        // Flatpak
        path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
        path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
        // Snap
        path.join(os.homedir(), 'snap', 'steam', 'common', '.steam', 'steam'),
        path.join(os.homedir(), 'snap', 'steam', 'common', '.local', 'share', 'Steam')
      ];

      for (const testPath of possibleSteamPaths) {
        const steamAppsPath = path.join(testPath, 'steamapps');
        if (fs.existsSync(steamAppsPath)) {
          steamPath = testPath;
          console.log('Found Steam at:', steamPath);
          break;
        }
      }
    }
  }

  if (!steamPath) {
    console.log('Steam installation not found, searching for standalone libraries...');

    // Try to find standalone Steam libraries even without main Steam install
    const standaloneLibraries = findStandaloneSteamLibraries();
    if (standaloneLibraries.length > 0) {
      libraries.push(...standaloneLibraries);
      console.log(`Found ${standaloneLibraries.length} standalone Steam libraries`);
    } else {
      console.log('No Steam libraries found');
    }

    return libraries;
  }

  // Add default Steam library
  const defaultLibrary = path.join(steamPath, 'steamapps');
  if (fs.existsSync(defaultLibrary)) {
    libraries.push(defaultLibrary);
    console.log('Default Steam library:', defaultLibrary);
  }

  // Read libraryfolders.vdf for additional libraries
  // Try both old (steamapps) and new (config) locations
  const vdfPaths = [
    path.join(steamPath, 'config', 'libraryfolders.vdf'),
    path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
  ];

  for (const vdfPath of vdfPaths) {
    if (fs.existsSync(vdfPath)) {
      console.log('Reading library folders from:', vdfPath);
      try {
        const vdfContent = fs.readFileSync(vdfPath, 'utf8');
        const additionalLibraries = parseLibraryFoldersVDF(vdfContent);

        for (const libPath of additionalLibraries) {
          const libSteamApps = path.join(libPath, 'steamapps');

          if (fs.existsSync(libSteamApps) && !libraries.includes(libSteamApps)) {
            libraries.push(libSteamApps);
            console.log('Found additional Steam library:', libSteamApps);
          }
        }

        break; // Found valid VDF file, stop searching
      } catch (error) {
        console.error(`Error reading ${vdfPath}:`, error.message);
      }
    }
  }

  // Also check for Steam Deck SD card libraries (Linux only)
  if (process.platform === 'linux') {
    const sdLibraries = findSteamDeckSDLibraries();
    for (const sdLib of sdLibraries) {
      if (!libraries.includes(sdLib)) {
        libraries.push(sdLib);
      }
    }
  }

  console.log(`Total Steam libraries found: ${libraries.length}`);
  return libraries;
}

/**
 * Parse libraryfolders.vdf file to extract library paths
 * Supports both old and new VDF formats
 */
function parseLibraryFoldersVDF(vdfContent) {
  const libraryPaths = [];

  // New format: "path" "E:\\Games\\Steam"
  const newFormatRegex = /"path"\s+"([^"]+)"/gi;
  let match;

  while ((match = newFormatRegex.exec(vdfContent)) !== null) {
    let libPath = match[1];
    // Normalize path: replace double backslashes and escaped backslashes
    libPath = libPath.replace(/\\\\/g, '\\').replace(/\\\//g, '/');

    if (libPath && !libraryPaths.includes(libPath)) {
      libraryPaths.push(libPath);
    }
  }

  // Old format fallback: "1" "E:\\Games\\Steam"
  if (libraryPaths.length === 0) {
    const oldFormatRegex = /"\d+"\s+"([^"]+)"/gi;

    while ((match = oldFormatRegex.exec(vdfContent)) !== null) {
      let libPath = match[1];
      // Normalize path
      libPath = libPath.replace(/\\\\/g, '\\').replace(/\\\//g, '/');

      // Check if it's a valid path (contains drive letter or starts with /)
      if (libPath && (libPath.match(/^[A-Za-z]:/) || libPath.startsWith('/')) && !libraryPaths.includes(libPath)) {
        libraryPaths.push(libPath);
      }
    }
  }

  return libraryPaths;
}

/**
 * Find Death Stranding in Steam
 */
function findSteamGame(gameFolder, libraries) {
  console.log(`Searching in Steam for: ${gameFolder}`);

  for (const library of libraries) {
    const gamePath = path.join(library, 'common', gameFolder);
    console.log(`Checking: ${gamePath}`);

    try {
      if (fs.existsSync(gamePath)) {
        const stats = fs.lstatSync(gamePath);
        if (stats.isDirectory() || stats.isSymbolicLink()) {
          // If it's a junction/symlink, resolve to real path
          const realPath = stats.isSymbolicLink()
            ? fs.realpathSync(gamePath)
            : gamePath;

          console.log(`Found game: ${realPath}${stats.isSymbolicLink() ? ' (resolved from junction)' : ''}`);
          return realPath;
        }
      }
    } catch (error) {
      console.error(`Error checking ${gamePath}:`, error.message);
    }
  }

  console.log(`Game not found in Steam with name "${gameFolder}"`);
  return null;
}

/**
 * Find Death Stranding in Epic Games (Windows and Linux via Heroic)
 */
function findEpicGame(gameFolder) {
  console.log(`Searching in Epic Games for: ${gameFolder}`);

  // Try Windows Epic Games Launcher first
  if (process.platform === 'win32') {
    const manifestPath = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
    const result = searchEpicManifests(manifestPath, gameFolder);
    if (result) return result;
  }

  // Try Heroic Games Launcher (Linux and Windows)
  const heroicPaths = [
    // Linux native
    path.join(os.homedir(), '.config', 'legendary', 'installed.json'),
    // Linux Flatpak
    path.join(os.homedir(), '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'legendary', 'installed.json'),
    // Windows Heroic
    path.join(os.homedir(), 'AppData', 'Roaming', 'heroic', 'legendary', 'installed.json')
  ];

  for (const heroicPath of heroicPaths) {
    if (fs.existsSync(heroicPath)) {
      console.log('Found Heroic Games Launcher config:', heroicPath);
      try {
        const content = fs.readFileSync(heroicPath, 'utf8');
        const installed = JSON.parse(content);

        for (const [gameId, gameData] of Object.entries(installed)) {
          if (gameData.install_path) {
            const installDir = path.basename(gameData.install_path);
            console.log(`Checking Heroic game: ${gameData.title || gameId} (${installDir})`);

            if (installDir.toLowerCase() === gameFolder.toLowerCase()) {
              if (fs.existsSync(gameData.install_path)) {
                console.log(`Found game in Heroic: ${gameData.install_path}`);
                return gameData.install_path;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error reading Heroic config ${heroicPath}:`, error.message);
      }
    }
  }

  console.log(`Game not found in Epic/Heroic with name "${gameFolder}"`);
  return null;
}

/**
 * Search Epic manifests in given path
 */
function searchEpicManifests(manifestPath, gameFolder) {
  console.log(`Epic manifests path: ${manifestPath}`);

  if (!fs.existsSync(manifestPath)) {
    console.log('Epic Games manifest folder does not exist');
    return null;
  }

  try {
    const files = fs.readdirSync(manifestPath).filter(f => f.endsWith('.item'));
    console.log(`Found ${files.length} Epic Games manifests`);

    for (const file of files) {
      const manifestFile = path.join(manifestPath, file);
      const content = fs.readFileSync(manifestFile, 'utf8');
      const manifest = JSON.parse(content);

      if (manifest.InstallLocation) {
        const installDir = path.basename(manifest.InstallLocation);
        console.log(`Checking game: ${manifest.DisplayName || 'Unknown'} (${installDir})`);

        if (installDir.toLowerCase() === gameFolder.toLowerCase()) {
          if (fs.existsSync(manifest.InstallLocation)) {
            console.log(`Found game in Epic: ${manifest.InstallLocation}`);
            return manifest.InstallLocation;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error searching Epic Games:', error.message);
  }

  return null;
}

/**
 * Auto-detect Death Stranding installation
 * @param {string} version - 'dc' or 'ds'
 */
async function detectDeathStranding(version) {
  console.log(`\n=== Starting Death Stranding search (${version}) ===`);

  // Get Steam libraries once
  const steamLibraries = await getSteamLibraries();

  // For diagnostics - list what folders actually exist
  if (process.env.DEBUG) {
    listSteamCommonFolders(steamLibraries);
  }

  // Folder names for different versions
  const folderNames = version === 'dc'
    ? [
        'DEATH STRANDING DIRECTORS CUT',
        'DEATH STRANDING DIRECTOR\'S CUT',
        'Death Stranding Director\'s Cut',
        'DeathStrandingDirectorsCut',
        'Death Stranding Directors Cut'
      ]
    : [
        'Death Stranding',           // Steam standard
        'DEATH STRANDING',           // All caps variant
        'DeathStranding',            // No space variant
        'death stranding',           // All lowercase (Linux case-sensitive)
        'Seagull'                    // Epic Games internal name
      ];

  console.log(`Searching for folder names: ${folderNames.join(', ')}`);

  // Search in Steam
  console.log('\n--- Searching in Steam ---');
  for (const folderName of folderNames) {
    const steamPath = findSteamGame(folderName, steamLibraries);
    if (steamPath) {
      console.log(`=== Game found! ===\n`);
      return { platform: 'Steam', path: steamPath };
    }
  }

  // Search in Epic
  console.log('\n--- Searching in Epic Games ---');
  for (const folderName of folderNames) {
    const epicPath = findEpicGame(folderName);
    if (epicPath) {
      console.log(`=== Game found! ===\n`);
      return { platform: 'Epic Games', path: epicPath };
    }
  }

  console.log('=== Game not found ===\n');
  return null;
}

/**
 * List all folders in Steam common directories for diagnostics
 */
function listSteamCommonFolders(libraries) {
  console.log('\n=== Listing actual folders in Steam common directories ===');

  for (const library of libraries) {
    const commonPath = path.join(library, 'common');
    if (fs.existsSync(commonPath)) {
      try {
        const folders = fs.readdirSync(commonPath);
        console.log(`\nLibrary: ${library}`);
        folders.slice(0, 10).forEach(folder => console.log(`  - ${folder}`));
        if (folders.length > 10) {
          console.log(`  ... and ${folders.length - 10} more folders`);
        }
      } catch (error) {
        console.error(`Error reading ${commonPath}:`, error.message);
      }
    } else {
      console.log(`\nLibrary common folder does not exist: ${commonPath}`);
    }
  }
  console.log('');
}

/**
 * Get list of all installed Steam games for diagnostics
 */
async function listAllSteamGames() {
  const libraries = await getSteamLibraries();
  const games = [];

  for (const library of libraries) {
    const commonPath = path.join(library, 'common');
    if (fs.existsSync(commonPath)) {
      try {
        const folders = fs.readdirSync(commonPath);
        games.push(...folders.map(f => ({ library, folder: f })));
      } catch (error) {
        console.error(`Error reading ${commonPath}:`, error);
      }
    }
  }

  return games;
}

module.exports = {
  detectDeathStranding,
  getSteamLibraries,
  findSteamGame,
  findEpicGame,
  listAllSteamGames,
  listSteamCommonFolders
};
