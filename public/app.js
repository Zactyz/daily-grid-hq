const lanes = ['backlog','doing','blocked','done'];

const els = {
  whoami: document.getElementById('whoami'),
  status: document.getElementById('status'),
  refreshStatus: document.getElementById('refresh-status'),
  form: document.getElementById('new-card-form'),
  input: document.getElementById('new-card-title'),
  laneEls: Object.fromEntries(lanes.map(s => [s, document.querySelector(`[data-lane="${s}"]`)])),
  countEls: Object.fromEntries(lanes.map(s => [s, document.querySelector(`[data-count="${s}"]`)]))
};

function cardEl(card) {
  const div = document.createElement('div');
  div.className = 'card rounded-2xl px-3 py-2 flex items-start justify-between gap-3';

  const left = document.createElement('div');
  left.className = 'min-w-0';

  const title = document.createElement('div');
  title.className = 'text-sm text-white/90 leading-snug break-words';
  title.textContent = card.title;

  const meta = document.createElement('div');
  meta.className = 'text-[11px] text-white/40 mono mt-1';
  meta.textContent = new Date(card.updatedAt).toLocaleString();

  left.appendChild(title);
  left.appendChild(meta);

  const right = document.createElement('div');
  right.className = 'flex items-center gap-1.5 flex-shrink-0';

  const select = document.createElement('select');
  select.className = 'bg-transparent border border-white/10 rounded-xl px-2 py-1 text-xs text-white/80';
  for (const s of lanes) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === card.status) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', async () => {
    await api(`/api/cards/${card.id}`, { method: 'PATCH', body: { status: select.value } });
    await refreshBoard();
  });

  const del = document.createElement('button');
  del.className = 'w-8 h-8 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5';
  del.title = 'Delete';
  del.textContent = '×';
  del.addEventListener('click', async () => {
    if (!confirm('Delete this card?')) return;
    await api(`/api/cards/${card.id}`, { method: 'DELETE' });
    await refreshBoard();
  });

  right.appendChild(select);
  right.appendChild(del);

  div.appendChild(left);
  div.appendChild(right);
  return div;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function refreshStatus() {
  const me = await api('/api/me');
  els.whoami.textContent = me.email ? `as ${me.email}` : '(dev)';

  const health = await api('/api/health');
  els.status.textContent = JSON.stringify({ me, health }, null, 2);
}

async function refreshBoard() {
  const data = await api('/api/cards');
  const byLane = Object.fromEntries(lanes.map(s => [s, []]));
  for (const c of (data.cards || [])) byLane[c.status].push(c);

  for (const s of lanes) {
    const lane = els.laneEls[s];
    lane.innerHTML = '';
    for (const c of byLane[s]) lane.appendChild(cardEl(c));
    els.countEls[s].textContent = String(byLane[s].length);
  }
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = els.input.value.trim();
  if (!title) return;
  els.input.value = '';
  await api('/api/cards', { method: 'POST', body: { title } });
  await refreshBoard();
});

els.refreshStatus.addEventListener('click', refreshStatus);

(async function main() {
  try {
    await refreshStatus();
    await refreshBoard();
  } catch (e) {
    els.status.textContent = String(e?.message || e);
  }
})();
