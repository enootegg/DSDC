/**
 * Fetches Crowdin approval progress and writes the version to package.json.
 * Version format: "0.{approvalProgress}" (e.g. 40% → "0.40")
 * Run before electron-builder.
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const CROWDIN_TOKEN = process.env.CROWDIN_TOKEN;
const PROJECT_ID = 749381;
const FILE_ID = 22;

if (!CROWDIN_TOKEN) {
  console.error('Error: CROWDIN_TOKEN environment variable is not set.');
  process.exit(1);
}

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  console.log('Fetching Crowdin approval progress...');

  const url = `https://api.crowdin.com/api/v2/projects/${PROJECT_ID}/files/${FILE_ID}/languages/progress`;
  const { status, body } = await httpsRequest(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${CROWDIN_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (status !== 200) {
    console.error(`Crowdin API error (${status}):`, body);
    process.exit(1);
  }

  const progress = body.data[0].data.approvalProgress;
  const version = `0.${progress}`;

  console.log(`Approval progress: ${progress}% → version: ${version}`);

  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  console.log(`Updated package.json version to ${version}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
