const fs = require('fs');
const path = require('path');

const frontRoot = path.join(__dirname, '..');
const backRoot = 'C:\\Users\\齊\\Desktop\\global_meals_gradle';
const outFile  = 'C:\\Users\\齊\\Desktop\\global_meals_code.md';
const lines = [];

// ── Header ──────────────────────────────────────
lines.push('# Global Meals — Full Source Code (Frontend + Backend)');
lines.push('');
lines.push('- **Frontend**: Angular 17+ Standalone + Signals (POS / Customer / Manager)');
lines.push('- **Backend**: Spring Boot + Gradle (REST API, PostgreSQL)');
lines.push('');

// ── Helper ──────────────────────────────────────
function addFile(filepath, rootLabel, lang) {
  const rel = path.relative(rootLabel === 'frontend' ? frontRoot : backRoot, filepath).split(path.sep).join('/');
  lines.push('## [' + rootLabel + '] ' + rel);
  lines.push('```' + lang);
  lines.push(fs.readFileSync(filepath, 'utf8'));
  lines.push('```');
  lines.push('');
}

function walk(dir, exts, excludeDirs, rootLabel) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (excludeDirs.includes(e.name)) continue;
      walk(full, exts, excludeDirs, rootLabel);
    } else {
      const ext = path.extname(e.name);
      if (!exts[ext]) continue;
      if (e.name.endsWith('.spec.ts')) continue;
      addFile(full, rootLabel, exts[ext]);
    }
  }
}

// ── Frontend ─────────────────────────────────────
lines.push('---');
lines.push('# FRONTEND (Angular)');
lines.push('');

['DESIGN.md', 'package.json'].forEach(f => {
  const fp = path.join(frontRoot, f);
  if (fs.existsSync(fp)) {
    const lang = f.endsWith('.json') ? 'json' : 'markdown';
    lines.push('## [frontend] ' + f);
    lines.push('```' + lang);
    lines.push(fs.readFileSync(fp, 'utf8'));
    lines.push('```');
    lines.push('');
  }
});

walk(
  path.join(frontRoot, 'src', 'app'),
  { '.ts': 'typescript', '.html': 'html', '.scss': 'scss' },
  ['node_modules', 'dist', '.angular'],
  'frontend'
);

// ── Backend ──────────────────────────────────────
lines.push('---');
lines.push('# BACKEND (Spring Boot)');
lines.push('');

['build.gradle', 'settings.gradle', 'README.md',
 'migration_add_kitchen_status.sql', 'migration_add_member_country.sql'].forEach(f => {
  const fp = path.join(backRoot, f);
  if (fs.existsSync(fp)) {
    const ext = path.extname(f).slice(1) || 'text';
    const lang = ext === 'gradle' ? 'groovy' : ext === 'md' ? 'markdown' : ext;
    lines.push('## [backend] ' + f);
    lines.push('```' + lang);
    lines.push(fs.readFileSync(fp, 'utf8'));
    lines.push('```');
    lines.push('');
  }
});

walk(
  path.join(backRoot, 'src'),
  { '.java': 'java', '.properties': 'properties', '.yml': 'yaml' },
  ['build', '.gradle', 'test'],
  'backend'
);

// ── Write ─────────────────────────────────────────
const out = lines.join('\n');
fs.writeFileSync(outFile, out, 'utf8');
const sizeMB = (fs.statSync(outFile).size / 1048576).toFixed(1);
console.log('Done:', sizeMB, 'MB →', outFile);
