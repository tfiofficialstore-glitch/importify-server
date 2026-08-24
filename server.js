require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { loadData, saveData } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
  console.warn('\n⚠️  WARNING: No API_KEY set in .env — your history server is UNPROTECTED.');
  console.warn('   Anyone who finds the URL can read/delete your import history.');
  console.warn('   Set API_KEY in your .env file before deploying.\n');
}

app.use(cors()); // extension calls this from a chrome-extension:// origin
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth middleware: checks X-Api-Key header against API_KEY ----
function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // no key configured = open (dev only)
  const key = req.header('x-api-key') || req.query.key;
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

function paginate(rows, page, limit) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
  const start = (pageNum - 1) * limitNum;
  const data = rows.slice(start, start + limitNum);
  return { data, page: pageNum, limit: limitNum, total: rows.length, totalPages: Math.ceil(rows.length / limitNum) || 1 };
}

function matchesSearch(row, search) {
  if (!search) return true;
  const s = search.toLowerCase();
  return (row.title && row.title.toLowerCase().includes(s)) || (row.sku && row.sku.toLowerCase().includes(s));
}

// ---- Health check (no auth, handy for hosting platforms) ----
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ============================================================
// IMPORTS — history of every product the extension has imported
// ============================================================

app.post('/api/imports', requireApiKey, (req, res) => {
  const b = req.body || {};
  if (!b.title && !b.sku) {
    return res.status(400).json({ error: 'title or sku is required' });
  }

  const data = loadData();
  const row = {
    id: crypto.randomUUID(),
    sku: b.sku || null,
    title: b.title || null,
    image: b.image || null,
    price: b.price != null ? String(b.price) : null,
    compare_at_price: b.compareAtPrice != null ? String(b.compareAtPrice) : null,
    website: b.website || 'Shein',
    vendor: b.vendor || null,
    status: b.status || 'success',
    message: b.message || null,
    shopify_product_id: b.shopifyProductId ? String(b.shopifyProductId) : null,
    shopify_store: b.shopifyStore || null,
    shopify_link: b.shopifyLink || null,
    batch_id: b.batchId || null,
    imported_at: b.importedAt || new Date().toISOString()
  };

  data.imports.unshift(row);
  saveData(data);
  res.status(201).json(row);
});

app.get('/api/imports', requireApiKey, (req, res) => {
  const { search = '', status, website, page = '1', limit = '25' } = req.query;
  const data = loadData();

  let rows = data.imports.filter(r =>
    matchesSearch(r, search) &&
    (!status || r.status === status) &&
    (!website || r.website === website)
  );
  rows = rows.slice().sort((a, b) => new Date(b.imported_at) - new Date(a.imported_at));

  res.json(paginate(rows, page, limit));
});

app.get('/api/stats', requireApiKey, (req, res) => {
  const data = loadData();
  const rows = data.imports;
  const todayStr = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  res.json({
    total: rows.length,
    success: rows.filter(r => r.status === 'success').length,
    failed: rows.filter(r => r.status === 'error').length,
    today: rows.filter(r => (r.imported_at || '').slice(0, 10) === todayStr).length,
    last7Days: rows.filter(r => new Date(r.imported_at).getTime() >= sevenDaysAgo).length
  });
});

app.get('/api/imports/:id', requireApiKey, (req, res) => {
  const data = loadData();
  const row = data.imports.find(r => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.delete('/api/imports/:id', requireApiKey, (req, res) => {
  const data = loadData();
  const before = data.imports.length;
  data.imports = data.imports.filter(r => r.id !== req.params.id);
  if (data.imports.length === before) return res.status(404).json({ error: 'Not found' });
  saveData(data);
  res.json({ deleted: true });
});

app.get('/api/imports/export/csv', requireApiKey, (req, res) => {
  const data = loadData();
  const rows = data.imports.slice().sort((a, b) => new Date(b.imported_at) - new Date(a.imported_at));
  const headers = ['id', 'sku', 'title', 'price', 'compare_at_price', 'website', 'vendor', 'status', 'shopify_product_id', 'shopify_link', 'imported_at'];

  const escapeCsv = (val) => {
    if (val == null) return '';
    const s = String(val);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="import-history.csv"');
  res.send(lines.join('\n'));
});

// ============================================================
// CATALOG — products synced from a Shein collection page,
// browsed/selected in the dashboard, then queued for the
// extension to pick up and import automatically.
// ============================================================

app.post('/api/catalog/bulk', requireApiKey, (req, res) => {
  const { collectionUrl, collectionTitle, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  const data = loadData();
  if (!data.syncs) data.syncs = [];
  const now = new Date().toISOString();
  let added = 0;

  for (const item of items) {
    if (!item.product_url) continue;
    const existing = data.catalog.find(c => c.product_url === item.product_url);

    if (existing) {
      if (existing.status === 'available') {
        existing.title = item.title || existing.title;
        existing.image = item.image || existing.image;
        existing.price = item.price != null ? String(item.price) : existing.price;
        existing.compare_price = item.compare_price != null ? String(item.compare_price) : existing.compare_price;
        existing.source_collection = collectionTitle || collectionUrl || existing.source_collection;
        existing.source_collection_url = collectionUrl || existing.source_collection_url;
        existing.updated_at = now;
      }
      continue;
    }

    data.catalog.unshift({
      id: crypto.randomUUID(),
      sku: item.sku || null,
      title: item.title || null,
      image: item.image || null,
      price: item.price != null ? String(item.price) : null,
      compare_price: item.compare_price != null ? String(item.compare_price) : null,
      product_url: item.product_url,
      website: 'Shein',
      source_collection: collectionTitle || collectionUrl || null,
      source_collection_url: collectionUrl || null,
      status: 'available',
      message: null,
      shopify_product_id: null,
      shopify_store: null,
      shopify_link: null,
      added_at: now,
      updated_at: now
    });
    added++;
  }

  // Record this sync event so the dashboard can tell which collection was
  // synced most recently (used to auto-select the "latest sync" filter).
  data.syncs.unshift({
    id: crypto.randomUUID(),
    url: collectionUrl || null,
    title: collectionTitle || collectionUrl || 'Untitled sync',
    itemCount: items.length,
    syncedAt: now
  });
  data.syncs = data.syncs.slice(0, 200); // keep the log from growing forever

  saveData(data);
  res.status(201).json({ added, total: items.length });
});

// ---- List distinct synced collections, most recent first (for the
// Product Finder "Collection" filter dropdown) ----
app.get('/api/catalog/collections', requireApiKey, (req, res) => {
  const data = loadData();
  const syncs = data.syncs || [];
  const seen = new Map(); // url -> { url, title, syncedAt }

  for (const s of syncs) {
    const key = s.url || s.title;
    if (!seen.has(key)) {
      seen.set(key, { url: s.url, title: s.title, syncedAt: s.syncedAt });
    }
  }

  const collections = [...seen.values()].sort((a, b) => new Date(b.syncedAt) - new Date(a.syncedAt));
  res.json({ data: collections });
});

app.get('/api/catalog', requireApiKey, (req, res) => {
  const { search = '', status = 'available', page = '1', limit = '30', collectionUrl } = req.query;
  const data = loadData();

  let rows = data.catalog.filter(r =>
    matchesSearch(r, search) &&
    (status === 'all' || r.status === status) &&
    (!collectionUrl || r.source_collection_url === collectionUrl)
  );
  rows = rows.slice().sort((a, b) => new Date(b.added_at) - new Date(a.added_at));

  res.json(paginate(rows, page, limit));
});

app.post('/api/catalog/queue', requireApiKey, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const data = loadData();
  const now = new Date().toISOString();
  let queued = 0;

  for (const item of data.catalog) {
    if (ids.includes(item.id) && (item.status === 'available' || item.status === 'error')) {
      item.status = 'queued';
      item.updated_at = now;
      queued++;
    }
  }

  saveData(data);
  res.json({ queued });
});

app.get('/api/catalog/queued', requireApiKey, (req, res) => {
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
  const data = loadData();
  const rows = data.catalog
    .filter(r => r.status === 'queued')
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
    .slice(0, limit);
  res.json({ data: rows });
});

app.patch('/api/catalog/:id', requireApiKey, (req, res) => {
  const b = req.body || {};
  const allowedStatus = ['available', 'queued', 'importing', 'imported', 'error'];
  const data = loadData();
  const item = data.catalog.find(r => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (b.status && allowedStatus.includes(b.status)) item.status = b.status;
  if (b.message !== undefined) item.message = b.message;
  if (b.shopifyProductId !== undefined) item.shopify_product_id = String(b.shopifyProductId);
  if (b.shopifyStore !== undefined) item.shopify_store = b.shopifyStore;
  if (b.shopifyLink !== undefined) item.shopify_link = b.shopifyLink;
  item.updated_at = new Date().toISOString();

  saveData(data);
  res.json(item);
});

app.delete('/api/catalog/:id', requireApiKey, (req, res) => {
  const data = loadData();
  const before = data.catalog.length;
  data.catalog = data.catalog.filter(r => r.id !== req.params.id);
  if (data.catalog.length === before) return res.status(404).json({ error: 'Not found' });
  saveData(data);
  res.json({ deleted: true });
});

// ---- Serve the dashboard for any other route (SPA-style) ----
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Importify History Server running on http://localhost:${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}`);
  console.log(`   API base:  http://localhost:${PORT}/api`);
});
