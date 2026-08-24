// db.js — plain JSON-file storage. No native modules, no compiling —
// works on ANY hosting (Railway, Render, or basic shared cPanel hosting)
// because it only uses Node's built-in "fs" module.
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DB_PATH || path.join(__dirname, 'data.json');

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    const initial = { imports: [], catalog: [], syncs: [], menu: [], browseQueue: [] };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.imports) parsed.imports = [];
    if (!parsed.catalog) parsed.catalog = [];
    if (!parsed.syncs) parsed.syncs = [];
    if (!parsed.menu) parsed.menu = [];
    if (!parsed.browseQueue) parsed.browseQueue = [];
    return parsed;
  } catch (e) {
    console.error('[DB] Could not read data.json, starting fresh:', e.message);
    return { imports: [], catalog: [], syncs: [], menu: [], browseQueue: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

module.exports = { loadData, saveData };

