# Українізатор Death Stranding (Electron версія)

Кросплатформенний інсталятор української локалізації для Death Stranding та Death Stranding Director's Cut.

## Вимоги

- Node.js 18.x або 20.x LTS: https://nodejs.org

## Встановлення залежностей

```bash
npm install
```

## Розробка

Запуск в режимі розробки:

```bash
npm start
```

## Збірка

### Windows

```bash
npm run build:win
```

Результат: `dist/Українізатор Death Stranding Setup 1.0.0.exe`

### Linux

```bash
npm run build:linux
```

Результат: `dist/Українізатор Death Stranding-1.0.0.AppImage`

### Обидві платформи

```bash
npm run build
```

## Структура проекту

```
death-stranding-localizer/
├── src/                      # Вихідний код
│   ├── main.js              # Electron головний процес (бекенд)
│   ├── preload.js           # Безпечний міст між процесами
│   ├── renderer.js          # Фронтенд логіка
│   ├── index.html           # UI
│   └── styles.css           # Стилі
│
├── resources/               # Ресурси для українізації
│   ├── Decima/             # Decima toolkit + JDK
│   ├── Localization/       # JSON файли з перекладами
│   └── Sources/            # Файли джерел гри
│
├── build/                   # Ресурси збірки
│   └── icon.ico            # Іконка додатку
│
├── package.json            # NPM конфігурація
└── electron-builder.json   # Конфігурація збірки
```

## Технології

- **Electron 28** - Кросплатформенний фреймворк для desktop додатків
- **Node.js** - JavaScript runtime для бекенду
- **HTML/CSS/JavaScript** - Фронтенд

## Як це працює

1. Користувач вибирає версію гри (DS або DSDC)
2. Вибирає теку з встановленою грою
3. Опціонально створює бекап
4. Натискає "Українізувати гру"
5. Додаток виконує дві команди через Decima toolkit:
   - `localization import` - імпорт українських перекладів
   - `repack` - перепакування гри з новими перекладами

## Ліцензія

MIT
