let apiKey = localStorage.getItem('importify_api_key') || '';
let currentPage = 1;
let currentSearch = '';
let currentStatus = '';
let totalPages = 1;

// ---------- Auth ----------
async function tryUnlock(key) {
  const res = await fetch('/api/imports?limit=1', { headers: { 'x-api-key': key } });
  if (res.status === 401) return false;
  return true;
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginKeyInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

async function doLogin() {
  const key = document.getElementById('loginKeyInput').value.trim();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const ok = await tryUnlock(key);
  if (!ok) {
    errEl.textContent = 'Invalid API key.';
    return;
  }
  apiKey = key;
  localStorage.setItem('importify_api_key', key);
  showApp();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('importify_api_key');
  apiKey = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
});

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  loadStats();
  loadImports();
  loadFinder(true);
}

// Auto-login if key already stored and valid
(async () => {
  if (apiKey) {
    const ok = await tryUnlock(apiKey);
    if (ok) { showApp(); return; }
  }
  document.getElementById('loginScreen').style.display = 'flex';
})();

// ---------- Nav ----------
document.querySelectorAll('.menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'statsPage') loadStats();
    if (btn.dataset.page === 'finderPage') loadFinder(true);
    if (btn.dataset.page === 'browsePage' && browseMenuData.length === 0) loadBrowseMenu();
  });
});

// ---------- API helper ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), 'x-api-key': apiKey, 'Content-Type': 'application/json' }
  });
  if (res.status === 401) {
    localStorage.removeItem('importify_api_key');
    apiKey = '';
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    throw new Error('Unauthorized');
  }
  return res;
}

// ---------- Stats ----------
async function loadStats() {
  try {
    const res = await api('/api/stats');
    const s = await res.json();
    document.getElementById('statTotal').textContent = s.total;
    document.getElementById('statSuccess').textContent = s.success;
    document.getElementById('statFailed').textContent = s.failed;
    document.getElementById('statToday').textContent = s.today;
    document.getElementById('statWeek').textContent = s.last7Days;
  } catch (e) { /* handled in api() */ }
}

// ---------- List ----------
async function loadImports() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Loading…</td></tr>';

  const params = new URLSearchParams({
    page: currentPage,
    limit: 15,
    search: currentSearch,
    status: currentStatus
  });

  try {
    const res = await api('/api/imports?' + params.toString());
    const json = await res.json();
    totalPages = json.totalPages || 1;
    renderTable(json.data);
    document.getElementById('pageLabel').textContent = `Page ${json.page} of ${json.totalPages || 1} (${json.total} total)`;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Could not load data.</td></tr>';
  }
}

function renderTable(rows) {
  const tbody = document.getElementById('tableBody');
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No products imported yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><img class="prod-img" src="${escAttr(r.image || '')}" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.visibility='hidden'" /></td>
      <td class="sku-cell">${escHtml(r.sku || '-')}</td>
      <td>${escHtml(truncate(r.title || 'Untitled', 46))}</td>
      <td><span class="badge badge-shein">${escHtml(r.website || 'Shein')}</span></td>
      <td><span class="badge ${r.status === 'success' ? 'badge-success' : 'badge-error'}">${r.status === 'success' ? 'Success' : 'Failed'}</span></td>
      <td>${formatDate(r.imported_at)}</td>
      <td>
        <button class="action-btn" title="View" onclick="viewRow('${r.id}')">👁</button>
        <button class="action-btn" title="Delete" onclick="deleteRow('${r.id}')">🗑</button>
      </td>
    </tr>
  `).join('');
}

async function viewRow(id) {
  const res = await api('/api/imports/' + id);
  const r = await res.json();
  document.getElementById('modalBody').innerHTML = `
    ${r.image ? `<img src="${escAttr(r.image)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ''}
    <h2>${escHtml(r.title || 'Untitled')}</h2>
    <div class="modal-row"><span>SKU</span><span>${escHtml(r.sku || '-')}</span></div>
    <div class="modal-row"><span>Status</span><span>${escHtml(r.status)}</span></div>
    <div class="modal-row"><span>Price</span><span>${r.price ? '$' + escHtml(r.price) : '-'}</span></div>
    <div class="modal-row"><span>Compare-at</span><span>${r.compare_at_price ? '$' + escHtml(r.compare_at_price) : '-'}</span></div>
    <div class="modal-row"><span>Vendor</span><span>${escHtml(r.vendor || '-')}</span></div>
    <div class="modal-row"><span>Website</span><span>${escHtml(r.website || '-')}</span></div>
    <div class="modal-row"><span>Shopify Store</span><span>${escHtml(r.shopify_store || '-')}</span></div>
    <div class="modal-row"><span>Shopify Product ID</span><span>${escHtml(r.shopify_product_id || '-')}</span></div>
    <div class="modal-row"><span>Imported</span><span>${formatDate(r.imported_at)}</span></div>
    ${r.message ? `<div class="modal-row"><span>Message</span><span>${escHtml(r.message)}</span></div>` : ''}
    ${r.shopify_link ? `<div style="margin-top:14px"><a href="${escAttr(r.shopify_link)}" target="_blank" style="color:#c44dff">Open in Shopify →</a></div>` : ''}
  `;
  document.getElementById('detailModal').style.display = 'flex';
}

document.getElementById('modalCloseBtn').addEventListener('click', () => {
  document.getElementById('detailModal').style.display = 'none';
});
document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target.id === 'detailModal') document.getElementById('detailModal').style.display = 'none';
});

async function deleteRow(id) {
  if (!confirm('Delete this record from history?')) return;
  await api('/api/imports/' + id, { method: 'DELETE' });
  loadImports();
  loadStats();
}

// ---------- Search / Filter / Pagination ----------
let searchDebounce;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    currentSearch = e.target.value.trim();
    currentPage = 1;
    loadImports();
  }, 350);
});

document.getElementById('statusFilter').addEventListener('change', (e) => {
  currentStatus = e.target.value;
  currentPage = 1;
  loadImports();
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; loadImports(); }
});
document.getElementById('nextPageBtn').addEventListener('click', () => {
  if (currentPage < totalPages) { currentPage++; loadImports(); }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  window.open('/api/imports/export/csv?key=' + encodeURIComponent(apiKey), '_blank');
});

// ---------- Helpers ----------
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso.includes('Z') || iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// BROWSE SHEIN — clickable category sidebar (from the synced Shein
// menu) that loads products for whichever category is clicked,
// asking the extension (via the browse queue) to fetch them if
// they aren't already cached.
// ============================================================
let browseMenuData = [];
let browseCategoryUrl = '';
let browseCategoryTitle = '';
let browsePage = 1;
let browseTotalPages = 1;
let browseSelectedIds = new Set();
let browsePollTimer = null;

async function loadBrowseMenu() {
  const menuEl = document.getElementById('browseMenu');
  try {
    const res = await api('/api/menu');
    const { data } = await res.json();
    browseMenuData = data || [];

    if (browseMenuData.length === 0) {
      menuEl.innerHTML = '<div class="empty-row" style="padding:16px 6px">Abhi koi menu sync nahi hua. Extension se "Sync Shein Menu" dabayen.</div>';
      return;
    }

    const topLevel = browseMenuData.filter(m => !m.parentName);
    let html = '';
    topLevel.forEach(top => {
      html += `<button class="browse-menu-item" data-url="${escAttr(top.url)}" data-title="${escAttr(top.name)}">${escHtml(top.name)}</button>`;
      const subs = browseMenuData.filter(m => m.parentName === top.name);
      if (subs.length > 0) {
        html += '<div class="browse-submenu">';
        subs.forEach(sub => {
          html += `<button class="browse-menu-item" data-url="${escAttr(sub.url)}" data-title="${escAttr(sub.name)}">${escHtml(sub.name)}</button>`;
        });
        html += '</div>';
      }
    });
    menuEl.innerHTML = html;

    menuEl.querySelectorAll('.browse-menu-item').forEach(btn => {
      btn.addEventListener('click', () => {
        menuEl.querySelectorAll('.browse-menu-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        openBrowseCategory(btn.dataset.url, btn.dataset.title);
      });
    });
  } catch (e) {
    menuEl.innerHTML = '<div class="empty-row" style="padding:16px 6px">Menu load nahi ho saka.</div>';
  }
}

async function openBrowseCategory(url, title) {
  browseCategoryUrl = url;
  browseCategoryTitle = title;
  browsePage = 1;
  browseSelectedIds.clear();
  updateBrowseSelectedCount();

  const grid = document.getElementById('browseGrid');
  grid.innerHTML = `<div class="empty-row">"${escHtml(title)}" ke products fetch ho rahe hain… (pehli baar ho to ~1 minute lag sakta hai)</div>`;
  document.getElementById('browsePageLabel').textContent = '';

  if (browsePollTimer) clearInterval(browsePollTimer);

  // Ask the server to queue this URL for the extension to scrape (no-op if
  // it was already synced recently — server handles that check).
  try { await api('/api/browse', { method: 'POST', body: JSON.stringify({ url, title }) }); } catch (e) {}

  let attempts = 0;
  const maxAttempts = 24; // ~72s at 3s interval
  const poll = async () => {
    attempts++;
    const got = await loadBrowseGrid(true);
    if (got || attempts >= maxAttempts) {
      clearInterval(browsePollTimer);
      if (!got) {
        grid.innerHTML = `<div class="empty-row">Abhi tak products nahi aaye. Extension browser mein open hai aur server settings sahi hain, ye confirm kar lein, phir dobara category click karein.</div>`;
      }
    }
  };
  poll();
  browsePollTimer = setInterval(poll, 3000);
}

// Returns true if at least one product was found/rendered
async function loadBrowseGrid(silent) {
  if (!browseCategoryUrl) return false;
  const grid = document.getElementById('browseGrid');

  const params = new URLSearchParams({
    page: browsePage, limit: 60, status: 'all', collectionUrl: browseCategoryUrl
  });
  const minPrice = document.getElementById('browseMinPrice').value.trim();
  const maxPrice = document.getElementById('browseMaxPrice').value.trim();
  const tag = document.getElementById('browseTagFilter').value;
  if (minPrice) params.set('minPrice', minPrice);
  if (maxPrice) params.set('maxPrice', maxPrice);
  if (tag && tag !== 'all') params.set('tag', tag);

  try {
    const res = await api('/api/catalog?' + params.toString());
    const json = await res.json();
    browseTotalPages = json.totalPages || 1;

    if (json.data.length === 0) {
      if (!silent) grid.innerHTML = '<div class="empty-row">Is filter se koi product nahi mila.</div>';
      return false;
    }

    renderBrowseGrid(json.data);
    document.getElementById('browsePageLabel').textContent = `Page ${json.page} of ${json.totalPages} (${json.total} total)`;
    return true;
  } catch (e) {
    return false;
  }
}

const TAG_CLASS = { 'New': 'tag-new', 'Trending': 'tag-trending', 'Hot': 'tag-hot', 'Flash Sale': 'tag-flash-sale' };

function renderBrowseGrid(rows) {
  const grid = document.getElementById('browseGrid');
  grid.innerHTML = rows.map(r => {
    const isSelectable = r.status === 'available' || r.status === 'error';
    const checked = browseSelectedIds.has(r.id) ? 'checked' : '';
    const statusLabel = STATUS_LABELS[r.status] || '';
    const badgeClass = STATUS_BADGE_CLASS[r.status] || '';
    return `
      <div class="finder-card ${browseSelectedIds.has(r.id) ? 'selected' : ''}" data-id="${r.id}">
        ${isSelectable ? `<input type="checkbox" class="finder-card-checkbox" ${checked} onclick="event.stopPropagation(); toggleBrowseSelect('${r.id}')" />` : ''}
        ${statusLabel ? `<span class="finder-card-status badge ${badgeClass}">${statusLabel}</span>` : ''}
        <img class="finder-card-img" src="${escAttr(r.image || '')}" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.visibility='hidden'" />
        <div class="finder-card-body">
          <div class="finder-card-title">${escHtml(truncate(r.title || 'Untitled', 60))}</div>
          ${r.tag ? `<span class="tag-badge ${TAG_CLASS[r.tag] || ''}">${escHtml(r.tag)}</span>` : ''}
          <div class="finder-card-meta">
            <span class="finder-card-price">${r.price ? '$' + escHtml(r.price) : ''}</span>
            <span class="sku-cell">${escHtml(r.sku || '')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.finder-card').forEach(card => {
    card.addEventListener('click', () => {
      const cb = card.querySelector('.finder-card-checkbox');
      if (cb) toggleBrowseSelect(card.dataset.id);
    });
  });
}

function toggleBrowseSelect(id) {
  if (browseSelectedIds.has(id)) browseSelectedIds.delete(id);
  else browseSelectedIds.add(id);
  const card = document.querySelector(`#browseGrid .finder-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle('selected', browseSelectedIds.has(id));
    const cb = card.querySelector('.finder-card-checkbox');
    if (cb) cb.checked = browseSelectedIds.has(id);
  }
  updateBrowseSelectedCount();
}

function updateBrowseSelectedCount() {
  document.getElementById('browseSelectedCount').textContent = browseSelectedIds.size;
  document.getElementById('browseImportSelectedBtn').disabled = browseSelectedIds.size === 0;
}

document.getElementById('browseApplyFiltersBtn').addEventListener('click', () => {
  browsePage = 1;
  loadBrowseGrid();
});

document.getElementById('browseSelectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('#browseGrid .finder-card-checkbox').forEach(cb => {
    const card = cb.closest('.finder-card');
    browseSelectedIds.add(card.dataset.id);
    cb.checked = true;
    card.classList.add('selected');
  });
  updateBrowseSelectedCount();
});

document.getElementById('browseImportSelectedBtn').addEventListener('click', async () => {
  if (browseSelectedIds.size === 0) return;
  const btn = document.getElementById('browseImportSelectedBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Queuing...';
  try {
    await api('/api/catalog/queue', { method: 'POST', body: JSON.stringify({ ids: [...browseSelectedIds] }) });
    browseSelectedIds.clear();
    loadBrowseGrid();
  } finally {
    btn.innerHTML = '⬆ Import Selected (<span id="browseSelectedCount">0</span>)';
  }
});

document.getElementById('browsePrevBtn').addEventListener('click', () => {
  if (browsePage > 1) { browsePage--; loadBrowseGrid(); }
});
document.getElementById('browseNextBtn').addEventListener('click', () => {
  if (browsePage < browseTotalPages) { browsePage++; loadBrowseGrid(); }
});
// select some, and queue them for the extension to auto-import.
// ============================================================
let finderPage = 1;
let finderTotalPages = 1;
let finderSearch = '';
let finderStatus = 'available';
let finderCollectionUrl = ''; // '' = all collections
let selectedIds = new Set();
let finderPollInterval = null;
const FINDER_PAGE_SIZE = 100;

async function loadCollectionsDropdown(preselectLatest) {
  const select = document.getElementById('finderCollectionFilter');
  try {
    const res = await api('/api/catalog/collections');
    const { data: collections } = await res.json();

    const options = ['<option value="">All Collections</option>'];
    collections.forEach((c, i) => {
      const label = (c.title || c.url || 'Untitled').slice(0, 45);
      options.push(`<option value="${escAttr(c.url || '')}">${i === 0 ? '🆕 ' : ''}${escHtml(label)}</option>`);
    });
    select.innerHTML = options.join('');

    // On first load, default to the MOST RECENTLY synced collection so old
    // syncs don't clutter the view — user can pick "All Collections" manually.
    if (preselectLatest && collections.length > 0) {
      finderCollectionUrl = collections[0].url || '';
      select.value = finderCollectionUrl;
    } else {
      select.value = finderCollectionUrl;
    }
  } catch (e) {
    select.innerHTML = '<option value="">All Collections</option>';
  }
}

document.getElementById('finderCollectionFilter').addEventListener('change', (e) => {
  finderCollectionUrl = e.target.value;
  finderPage = 1;
  selectedIds.clear();
  loadFinder();
});

async function loadFinder(isFirstLoad) {
  const grid = document.getElementById('finderGrid');
  grid.innerHTML = '<div class="empty-row">Loading…</div>';

  if (isFirstLoad) {
    await loadCollectionsDropdown(true); // auto-select latest sync on first open
  }

  const params = new URLSearchParams({
    page: finderPage, limit: FINDER_PAGE_SIZE, search: finderSearch, status: finderStatus
  });
  if (finderCollectionUrl) params.set('collectionUrl', finderCollectionUrl);

  try {
    const res = await api('/api/catalog?' + params.toString());
    const json = await res.json();
    finderTotalPages = json.totalPages || 1;
    renderFinder(json.data);
    document.getElementById('finderPageLabel').textContent = `Page ${json.page} of ${json.totalPages || 1} (${json.total} total)`;
  } catch (e) {
    grid.innerHTML = '<div class="empty-row">Could not load products.</div>';
  }

  // Keep polling while this page is open, so status updates from the
  // extension (queued → importing → imported) show up automatically.
  if (!finderPollInterval) {
    finderPollInterval = setInterval(() => {
      if (document.getElementById('finderPage').classList.contains('active')) loadFinder();
    }, 8000);
  }
}

const STATUS_LABELS = {
  available: '', queued: 'Queued', importing: 'Importing…', imported: 'Imported ✓', error: 'Failed'
};
const STATUS_BADGE_CLASS = {
  queued: 'badge-shein', importing: 'badge-shein', imported: 'badge-success', error: 'badge-error'
};

function renderFinder(rows) {
  const grid = document.getElementById('finderGrid');
  if (!rows || rows.length === 0) {
    grid.innerHTML = '<div class="empty-row">Koi product nahi mila. Shein pe collection page kholein aur extension se "Sync This Collection" dabayen.</div>';
    updateSelectedCount();
    return;
  }

  grid.innerHTML = rows.map(r => {
    const isSelectable = r.status === 'available' || r.status === 'error';
    const checked = selectedIds.has(r.id) ? 'checked' : '';
    const statusLabel = STATUS_LABELS[r.status] || '';
    const badgeClass = STATUS_BADGE_CLASS[r.status] || '';
    return `
      <div class="finder-card ${selectedIds.has(r.id) ? 'selected' : ''}" data-id="${r.id}">
        ${isSelectable ? `<input type="checkbox" class="finder-card-checkbox" ${checked} onclick="event.stopPropagation(); toggleSelect('${r.id}')" />` : ''}
        ${statusLabel ? `<span class="finder-card-status badge ${badgeClass}">${statusLabel}</span>` : ''}
        <img class="finder-card-img" src="${escAttr(r.image || '')}" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.visibility='hidden'" />
        <div class="finder-card-body">
          <div class="finder-card-title">${escHtml(truncate(r.title || 'Untitled', 60))}</div>
          <div class="finder-card-meta">
            <span class="finder-card-price">${r.price ? '$' + escHtml(r.price) : ''}</span>
            <span class="sku-cell">${escHtml(r.sku || '')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.finder-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const cb = card.querySelector('.finder-card-checkbox');
      if (cb) toggleSelect(id);
    });
  });

  updateSelectedCount();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);

  const card = document.querySelector(`.finder-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle('selected', selectedIds.has(id));
    const cb = card.querySelector('.finder-card-checkbox');
    if (cb) cb.checked = selectedIds.has(id);
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = selectedIds.size;
  document.getElementById('importSelectedBtn').disabled = selectedIds.size === 0;
}

document.getElementById('selectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.finder-card-checkbox').forEach(cb => {
    const card = cb.closest('.finder-card');
    selectedIds.add(card.dataset.id);
    cb.checked = true;
    card.classList.add('selected');
  });
  updateSelectedCount();
});

document.getElementById('importSelectedBtn').addEventListener('click', async () => {
  if (selectedIds.size === 0) return;
  const btn = document.getElementById('importSelectedBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Queuing...';

  try {
    await api('/api/catalog/queue', {
      method: 'POST',
      body: JSON.stringify({ ids: [...selectedIds] })
    });
    selectedIds.clear();
    loadFinder();
  } finally {
    btn.innerHTML = '⬆ Import Selected (<span id="selectedCount">0</span>)';
  }
});

let finderSearchDebounce;
document.getElementById('finderSearchInput').addEventListener('input', (e) => {
  clearTimeout(finderSearchDebounce);
  finderSearchDebounce = setTimeout(() => {
    finderSearch = e.target.value.trim();
    finderPage = 1;
    loadFinder();
  }, 350);
});

document.getElementById('finderStatusFilter').addEventListener('change', (e) => {
  finderStatus = e.target.value;
  finderPage = 1;
  selectedIds.clear();
  loadFinder();
});

document.getElementById('finderPrevBtn').addEventListener('click', () => {
  if (finderPage > 1) { finderPage--; loadFinder(); }
});
document.getElementById('finderNextBtn').addEventListener('click', () => {
  if (finderPage < finderTotalPages) { finderPage++; loadFinder(); }
});
