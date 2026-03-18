/**
 * Unified localization build script (replaces steps/step2 + steps/step3).
 *
 * Step 1: Export translations from Crowdin → download CSV
 * Step 2: Parse CSV → localization.json  (Director's Cut version)
 * Step 3: Generate localization_ds_not_dc.json  (original Death Stranding version)
 *
 * Output: resources/Localization/localization.json
 *         resources/Localization/localization_ds_not_dc.json
 */

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CROWDIN_TOKEN = process.env.CROWDIN_TOKEN;
const PROJECT_ID = 749381;
const FILE_ID = 22;

const OUTPUT_DIR = path.join(__dirname, '..', 'resources', 'Localization');
const SOURCE_SHOW_DS_PATH = path.join(__dirname, 'data', 'source_show_ds.json');
const ONLY_IN_DS_PATH = path.join(__dirname, 'data', 'localization_only_in_ds_not_dc.json');

if (!CROWDIN_TOKEN) {
  console.error('Error: CROWDIN_TOKEN environment variable is not set.');
  process.exit(1);
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsRequest(res.headers.location, { method: 'GET' }));
        return;
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, text: body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function httpsJSON(url, options = {}) {
  const { status, text } = await httpsRequest(url, options);
  return { status, body: JSON.parse(text) };
}

// ─── Step 1: Export from Crowdin ─────────────────────────────────────────────

async function exportFromCrowdin() {
  console.log('Step 1: Requesting Crowdin export...');

  const exportBody = JSON.stringify({ targetLanguageId: 'uk', fileIds: [FILE_ID] });
  const { status, body } = await httpsJSON(
    `https://api.crowdin.com/api/v2/projects/${PROJECT_ID}/translations/exports`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CROWDIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(exportBody),
      },
      body: exportBody,
    }
  );

  if (status !== 200) {
    throw new Error(`Crowdin export failed (${status}): ${JSON.stringify(body)}`);
  }

  const downloadUrl = body.data.url;
  console.log('Step 1: Downloading CSV...');

  const { text: csvText } = await httpsRequest(downloadUrl, { method: 'GET' });
  console.log(`Step 1: Downloaded ${csvText.length} bytes of CSV.`);

  return csvText;
}

// ─── Step 2: CSV → JSON (port of parser.py) ──────────────────────────────────

function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (ch === '\r' && !inQuotes) {
      // skip \r
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  return lines.map((line) => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  });
}

function csvToJSON(csvText) {
  console.log('Step 2: Parsing CSV → JSON...');

  const rows = parseCSV(csvText);
  if (rows.length < 2) throw new Error('CSV has no data rows.');

  // header: Key, Source string, Translation, Context
  const header = rows[0];
  const keyIdx = header.indexOf('Key');
  const sourceIdx = header.indexOf('Source string');
  const translationIdx = header.indexOf('Translation');

  if (keyIdx === -1 || sourceIdx === -1 || translationIdx === -1) {
    throw new Error(`Unexpected CSV header: ${header.join(', ')}`);
  }

  const result = { source: 'English', target: 'English', files: {} };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[keyIdx]) continue;

    const key = row[keyIdx];
    const sourceStr = row[sourceIdx] || '';
    const translation = row[translationIdx] || '';

    // Split on LAST occurrence of @@@@
    const splitIdx = key.lastIndexOf('@@@@');
    if (splitIdx === -1) continue;

    const filename = key.slice(0, splitIdx);
    const stringId = key.slice(splitIdx + 4);

    if (!result.files[filename]) result.files[filename] = {};

    result.files[filename][stringId] = {
      source: sourceStr,
      target: translation || sourceStr,
      show: 'auto',
    };
  }

  const count = Object.values(result.files).reduce((n, f) => n + Object.keys(f).length, 0);
  console.log(`Step 2: Parsed ${count} strings across ${Object.keys(result.files).length} files.`);

  return result;
}

// ─── Step 3: Generate DS version ─────────────────────────────────────────────

function buildDSVersion(dcLocalization) {
  console.log('Step 3: Building DS (non-DC) localization...');

  // Extract target map from freshly built DC localization (replaces split.js)
  const targetMap = {};
  for (const [filePath, strings] of Object.entries(dcLocalization.files)) {
    targetMap[filePath] = {};
    for (const [lineId, data] of Object.entries(strings)) {
      targetMap[filePath][lineId] = { target: data.target };
    }
  }

  // Load static DS source structure (replaces source_show_ds.json from step3)
  const sourceShowDS = JSON.parse(fs.readFileSync(SOURCE_SHOW_DS_PATH, 'utf8'));

  // Merge DS structure + DC targets (replaces merge.js)
  const merged = { source: 'English', target: 'English', files: {} };
  let missingFiles = 0;
  let missingLines = 0;

  for (const [filePath, strings] of Object.entries(sourceShowDS)) {
    if (!targetMap[filePath]) {
      missingFiles++;
      continue;
    }
    merged.files[filePath] = {};
    for (const [lineId, data] of Object.entries(strings)) {
      if (!targetMap[filePath][lineId]) {
        missingLines++;
        continue;
      }
      merged.files[filePath][lineId] = {
        source: data.source,
        target: targetMap[filePath][lineId].target,
        show: data.show,
      };
    }
  }

  if (missingFiles > 0) console.warn(`Step 3: Warning — ${missingFiles} DS file paths missing in DC data.`);
  if (missingLines > 0) console.warn(`Step 3: Warning — ${missingLines} DS lines missing in DC data.`);

  // Append DS-exclusive strings (localization_only_in_ds_not_dc.json)
  const onlyInDS = JSON.parse(fs.readFileSync(ONLY_IN_DS_PATH, 'utf8'));
  Object.assign(merged.files, onlyInDS.files);

  const count = Object.values(merged.files).reduce((n, f) => n + Object.keys(f).length, 0);
  console.log(`Step 3: DS version has ${count} strings across ${Object.keys(merged.files).length} files.`);

  return merged;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const csvText = await exportFromCrowdin();

  const dcLocalization = csvToJSON(csvText);
  const dcPath = path.join(OUTPUT_DIR, 'localization.json');
  fs.writeFileSync(dcPath, JSON.stringify(dcLocalization, null, 2), 'utf8');
  console.log(`Wrote: ${dcPath}`);

  const dsLocalization = buildDSVersion(dcLocalization);
  const dsPath = path.join(OUTPUT_DIR, 'localization_ds_not_dc.json');
  fs.writeFileSync(dsPath, JSON.stringify(dsLocalization, null, 2), 'utf8');
  console.log(`Wrote: ${dsPath}`);

  console.log('Done! Both localization files are ready.');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
