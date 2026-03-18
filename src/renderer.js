// Елементи DOM
const installView = document.getElementById('install-view');
const progressView = document.getElementById('progress-view');
const successView = document.getElementById('success-view');
const customSelect = document.getElementById('game-version-select');
const selectTrigger = customSelect.querySelector('.select-trigger');
const selectOptions = customSelect.querySelector('.select-options');
const selectedVersionSpan = document.getElementById('selected-version');
const gameDirInput = document.getElementById('game-dir');
const createBackupCheckbox = document.getElementById('create-backup');
const browseBtn = document.getElementById('browse-btn');
const installBtn = document.getElementById('install-btn');
const closeBtn = document.getElementById('close-btn');

let selectedGameDir = '';
let selectedGameVersion = 'dc'; // За замовчуванням Director's Cut

// Кастомний селект
selectTrigger.addEventListener('click', () => {
    customSelect.classList.toggle('open');
    selectOptions.classList.toggle('hidden');
});

// Вибір опції
const optionElements = selectOptions.querySelectorAll('.select-option');
optionElements.forEach(option => {
    option.addEventListener('click', async () => {
        selectedGameVersion = option.getAttribute('data-value');
        selectedVersionSpan.textContent = option.textContent;

        // Видалити клас selected з усіх опцій
        optionElements.forEach(opt => opt.classList.remove('selected'));
        // Додати клас selected до вибраної опції
        option.classList.add('selected');

        // Закрити селект
        customSelect.classList.remove('open');
        selectOptions.classList.add('hidden');

        // Автоматично шукати шлях до гри
        await detectAndSetGamePath();
    });
});

// Закрити селект при кліку поза ним
document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
        customSelect.classList.remove('open');
        selectOptions.classList.add('hidden');
    }
});

// Keyboard navigation
selectTrigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        customSelect.classList.toggle('open');
        selectOptions.classList.toggle('hidden');
    }
});

// Функція автоматичного визначення шляху до гри
async function detectAndSetGamePath() {
    gameDirInput.value = 'Пошук гри...';
    gameDirInput.style.color = 'var(--color-text-label)';

    try {
        const result = await window.electronAPI.detectGamePath(selectedGameVersion);

        if (result && result.path) {
            selectedGameDir = result.path;
            gameDirInput.value = result.path;
            gameDirInput.style.color = 'var(--color-text-success)';

            const originalPlaceholder = gameDirInput.placeholder;
            gameDirInput.placeholder = `Знайдено (${result.platform})`;
            setTimeout(() => {
                gameDirInput.placeholder = originalPlaceholder;
            }, 3000);

            await checkAndUpdateUI();
        } else {
            selectedGameDir = '';
            gameDirInput.value = 'Гру не знайдено - виберіть теку вручну';
            gameDirInput.style.color = 'var(--color-text-dim)';
            showInstallUI();
        }
    } catch (error) {
        console.error('Помилка автоматичного визначення:', error);
        selectedGameDir = '';
        gameDirInput.value = 'Помилка пошуку - виберіть теку вручну';
        gameDirInput.style.color = '#ff6b6b';
        showInstallUI();
    }
}

// Автоматично шукати гру при завантаженні
window.addEventListener('DOMContentLoaded', () => {
    detectAndSetGamePath();
});

// Вибір директорії
browseBtn.addEventListener('click', async () => {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
        selectedGameDir = dir;
        gameDirInput.value = dir;
        gameDirInput.style.color = 'var(--color-text-main)';

        await checkAndUpdateUI();
    }
});

// Українізація
installBtn.addEventListener('click', async () => {
    const gameVersion = selectedGameVersion;
    const createBackup = createBackupCheckbox.checked;

    if (!selectedGameDir) {
        alert('Будь ласка, виберіть теку з грою');
        return;
    }

    showView('progress');

    try {
        const result = await window.electronAPI.installLocalization({
            gameVersion,
            gameDir: selectedGameDir,
            createBackup
        });

        if (result.success) {
            showView('success');
        } else {
            alert(`Сталася помилка: ${result.error}`);
            showView('install');
        }
    } catch (error) {
        alert(`Сталася помилка: ${error.message}`);
        showView('install');
    }
});

// Закрити додаток
closeBtn.addEventListener('click', () => {
    window.close();
});

// Перемикання між екранами
function showView(viewName, progressText = 'УКРАЇНІЗАЦІЯ...') {
    installView.classList.add('hidden');
    progressView.classList.add('hidden');
    successView.classList.add('hidden');

    switch (viewName) {
        case 'progress':
            progressView.classList.remove('hidden');
            document.getElementById('progress-text').textContent = progressText;
            break;
        case 'success':
            successView.classList.remove('hidden');
            break;
        default:
            installView.classList.remove('hidden');
    }
}

// Перевірка наявності бекапу та оновлення UI
async function checkAndUpdateUI() {
    if (!selectedGameDir) {
        showInstallUI();
        return;
    }

    try {
        const hasBackup = await window.electronAPI.checkBackup(selectedGameDir);
        if (hasBackup) {
            showUninstallUI();
        } else {
            showInstallUI();
        }
    } catch (error) {
        console.error('Error checking backup:', error);
        showInstallUI();
    }
}

// Показати UI для встановлення
function showInstallUI() {
    const backupContainer = document.querySelector('.backup-checkbox-container');
    if (!backupContainer) return;

    const existingLink = backupContainer.querySelector('.uninstall-link');
    if (existingLink) existingLink.remove();

    const checkboxLabel = backupContainer.querySelector('.custom-checkbox-label');
    if (checkboxLabel) checkboxLabel.style.display = '';
}

// Показати UI для деінсталяції
function showUninstallUI() {
    const backupContainer = document.querySelector('.backup-checkbox-container');
    if (!backupContainer) return;

    const checkboxLabel = backupContainer.querySelector('.custom-checkbox-label');
    if (checkboxLabel) checkboxLabel.style.display = 'none';

    const existingLink = backupContainer.querySelector('.uninstall-link');
    if (existingLink) existingLink.remove();

    const uninstallLink = document.createElement('a');
    uninstallLink.href = '#';
    uninstallLink.className = 'uninstall-link';
    uninstallLink.textContent = 'Видалити переклад';

    uninstallLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleUninstall();
    });

    backupContainer.appendChild(uninstallLink);
}

// Обробка деінсталяції
async function handleUninstall() {
    const confirmed = confirm('Ви впевнені, що хочете видалити переклад і відновити оригінальну мову гри?');
    if (!confirmed) return;

    showView('progress', 'ВИДАЛЕННЯ...');

    try {
        const result = await window.electronAPI.uninstallLocalization(selectedGameDir);

        if (result.success) {
            alert('Переклад успішно видалено. Оригінальна мова гри відновлена.');
            showView('install');
            showInstallUI();
        } else {
            alert(`Сталася помилка: ${result.error}`);
            showView('install');
        }
    } catch (error) {
        alert(`Сталася помилка: ${error.message}`);
        showView('install');
    }
}
