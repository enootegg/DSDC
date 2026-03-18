# Українізатор Death Stranding

Electron-додаток для встановлення української локалізації Death Stranding та Death Stranding: Director's Cut.

## Як це працює

1. Користувач вибирає версію гри (DS або DSDC)
2. Вказує теку з встановленою грою
3. Опціонально створює резервну копію
4. Натискає «Українізувати гру»
5. Додаток виконує імпорт перекладів та перепакування гри через [Decima Workshop](https://github.com/ShadelessFox/decima)

Версія перекладу відповідає відсотку затверджених рядків у Crowdin.

## Структура проекту

```
death-stranding-localizer/
├── .github/workflows/
│   └── build.yml                  # CI/CD: автоматична збірка кожні 3 дні
│
├── scripts/
│   ├── set-version.js             # Отримує % перекладу з Crowdin → записує у package.json
│   ├── build-localization.js      # Crowdin CSV → localization.json (DC + DS версії)
│   └── data/
│       ├── source_show_ds.json                    # Структура рядків оригінального DS
│       └── localization_only_in_ds_not_dc.json    # Рядки, яких немає в DC
│
├── src/
│   ├── main.js                    # Electron головний процес
│   ├── preload.js                 # Міст між процесами
│   ├── renderer.js                # Фронтенд логіка
│   ├── index.html                 # UI (3 екрани: встановлення, прогрес, успіх)
│   ├── styles.css                 # Death Stranding-стиль
│   └── images/                   # Іконки та фонові зображення
│
├── resources/                     # Ресурси для українізації (не в репо)
│   ├── Localization/              # Генерується скриптами при збірці
│   ├── Sources/                   # Скачується з Cloudflare R2 при збірці
│   ├── Sources_DSDC_Only/         # Скачується з Cloudflare R2 при збірці
│   ├── Decima_win/                # Decima toolkit (Windows)
│   └── Decima_linux/              # Decima toolkit (Linux)
│
├── build/
│   ├── icon.ico                   # Іконка (16–256px)
│   └── icon.png                   # Іконка (256×256)
│
├── electron-builder.json          # Конфігурація збірки
├── package.json
└── .env.example                   # Приклад змінних середовища
```

## CI/CD

Збірка запускається автоматично:
- кожні 3 дні о 6:00 UTC
- при push у `main`
- вручну через GitHub Actions → «Run workflow»

Після збірки автоматично публікується GitHub Release з `.exe` файлом.

## Технології

- **Electron 28** + HTML/CSS/JS
- **electron-builder 24** — пакування у portable `.exe`
- **Crowdin API v2** — завантаження перекладів
- **Cloudflare R2** — зберігання бінарних ресурсів гри
- **GitHub Actions** — CI/CD
- **[Decima Workshop](https://github.com/ShadelessFox/decima)** — інструмент для роботи з файлами ігор на рушії Decima

## Ліцензія

MIT
