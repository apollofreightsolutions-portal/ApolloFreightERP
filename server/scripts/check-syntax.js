'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const roots = ['src', 'test'];
const files = [];

function collectJavaScript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectJavaScript(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) collectJavaScript(root);
}
files.sort();

if (!files.length) {
  console.error('No JavaScript files found under src/ or test/.');
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(`${file}\n${result.stderr || result.stdout || 'Syntax check failed.'}`);
  }
}

if (failures) {
  console.error(`Syntax check failed for ${failures} of ${files.length} JavaScript files.`);
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} JavaScript files under src/ and test/.`);
