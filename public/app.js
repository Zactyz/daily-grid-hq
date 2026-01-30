const lanes = ['backlog','doing','blocked','done'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const priorityColors = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444'
};

let sortableInstances = {};
let sortableInitialized = false;
let cardsData = {};
let pollingInterval = null;
let lastUpdateTime = null;

// Perf: avoid rebuilding lanes / resetting Sortable unless something actually changed.
let lastLaneSigs = Object.fromEntries(lanes.map(l => [l, null]));
let lastURL = null;

const els = {
  whoami: document.getElementById('whoami'),
  status: document.getElementById('status'),
  statusSummary: document.getElementById('status-summary'),
  statusDetails: document.getElementById('status-details'),
  healthIndicator: document.getElementById('health-indicator'),
  lastUpdate: document.getElementById('last-update'),
  refreshStatus: document.getElementById('refresh-status'),
  form: document.getElementById('new-card-form'),
  input: document.getElementById('new-card-title'),

  // Search exists in two places:
  // - Desktop header (#search-input)
  // - Mobile sticky bar (collapsed by default; expand via #mobile-search-toggle)
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  mobileSearchToggle: document.getElementById('mobile-search-toggle'),
  mobileSearchWrap: document.getElementById('mobile-search-wrap'),
  mobileSearchInput: document.getElementById('mobile-search-input'),
  mobileClearSearch: document.getElementById('mobile-clear-search'),
  mobileHelp: document.getElementById('mobile-help'),

  laneEls: Object.fromEntries(lanes.map(s => [s, document.querySelector(`[data-lane="${s}"]`)])),
  // There are multiple count badges (mobile tabs + column headers)
  countEls: Object.fromEntries(lanes.map(s => [s, Array.from(document.querySelectorAll(`[data-count="${s}"]`))])),
  laneSwitcher: document.getElementById('lane-switcher'),
  laneTabBtns: Array.from(document.querySelectorAll('#lane-switcher [data-tab]')),
  cardModal: document.getElementById('card-modal'),
  modalContent: document.getElementById('modal-content'),
  closeModal: document.getElementById('close-modal'),
  shortcutsModal: document.getElementById('shortcuts-modal'),
  shortcutsContent: document.getElementById('shortcuts-content'),
  closeShortcuts: document.getElementById('close-shortcuts'),
  toast: document.getElementById('toast'),
  fridayMessage: document.getElementById('friday-message'),
  fridayMode: document.getElementById('friday-mode'),
  fridayModeText: document.getElementById('friday-mode-text'),
  fridayDot: document.getElementById('friday-dot'),
  fridayUpdated: document.getElementById('friday-updated'),
  fridayFocus: document.getElementById('friday-focus'),
  saveFriday: document.getElementById('save-friday'), // may be null (UI is read-only in prod)

  // Mobile quick add
  fabNewCard: document.getElementById('fab-new-card'),
  quickAddModal: document.getElementById('quick-add-modal'),
  quickAddForm: document.getElementById('quick-add-form'),
  quickAddTitle: document.getElementById('quick-add-title-input'),
  quickAddStatus: document.getElementById('quick-add-status'),
  closeQuickAdd: document.getElementById('close-quick-add')
};

let searchQuery = '';
let filterStatus = null;
let filterPriority = null;
let showArchived = false;

// Mobile-only lane switcher state
let activeLane = null;
let laneParamSeen = false; // whether URL included lane=... at least once

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

// Mobile sticky search (collapsed → icon; expands to full input)
let mobileSearchExpanded = false;

function setMobileSearchExpanded(expanded, { focus = false } = {}) {
  mobileSearchExpanded = !!expanded;

  // If the user already has a query, keep search visible so it’s not "mysteriously active".
  if (!expanded && searchQuery) mobileSearchExpanded = true;

  if (els.mobileSearchWrap) {
    els.mobileSearchWrap.classList.toggle('hidden', !mobileSearchExpanded);
    els.mobileSearchWrap.classList.toggle('flex', mobileSearchExpanded);
  }

  if (els.mobileSearchToggle) {
    els.mobileSearchToggle.setAttribute('aria-expanded', mobileSearchExpanded ? 'true' : 'false');

    // Subtle "active" styling when search is engaged.
    const active = mobileSearchExpanded || !!searchQuery;
    els.mobileSearchToggle.classList.toggle('border', active);
    els.mobileSearchToggle.classList.toggle('border-white/20', active);
  }

  // Clear button should only be visible when there is a query.
  els.mobileClearSearch?.classList.toggle('hidden', !searchQuery);

  if (mobileSearchExpanded && focus) {
    // Let the DOM update before focusing (iOS can drop focus otherwise).
    setTimeout(() => els.mobileSearchInput?.focus(), 0);
  }
}

// Mobile keyboard-safe bottom sheets:
// Use visualViewport (when available) to size sheets to the *visible* viewport
// and to add bottom padding so sticky actions don’t sit behind the keyboard.
function updateViewportVars() {
  const vv = window.visualViewport;
  const vvh = vv?.height || window.innerHeight;
  // On iOS, offsetTop can be non-zero when the URL bar collapses/expands.
  const offsetTop = vv?.offsetTop || 0;
  const keyboardInset = Math.max(0, window.innerHeight - vvh - offsetTop);

  document.documentElement.style.setProperty('--vvh', `${vvh}px`);
  document.documentElement.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
}

function maybeKeepFocusedControlVisible(e) {
  if (!isMobileViewport()) return;
  const t = e?.target;
  if (!(t instanceof HTMLElement)) return;
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;

  const cardOpen = els.cardModal && !els.cardModal.classList.contains('hidden');
  const quickAddOpen = els.quickAddModal && !els.quickAddModal.classList.contains('hidden');
  if (!cardOpen && !quickAddOpen) return;

  // Only apply when focusing inside a sheet.
  if (!t.closest('#card-modal') && !t.closest('#quick-add-modal')) return;

  // Update vars immediately, then nudge the focused control into view.
  updateViewportVars();
  setTimeout(() => {
    try {
      t.scrollIntoView({ block: 'center' });
    } catch {}
  }, 50);
}

function setActiveLane(lane, { persist = true, reflectURL = true } = {}) {
  if (!lanes.includes(lane)) return;
  activeLane = lane;
  if (reflectURL) laneParamSeen = true;

  // Toggle mobile column visibility
  const cols = document.querySelectorAll('[data-lane-col]');
  cols.forEach(col => {
    const isActive = col.getAttribute('data-lane-col') === lane;
    col.classList.toggle('active', isActive);
  });

  // Tabs state
  if (els.laneTabBtns?.length) {
    els.laneTabBtns.forEach(btn => {
      const isActive = btn.getAttribute('data-tab') === lane;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
    });
  }

  // Keep quick-add defaults in sync.
  if (els.quickAddStatus && isMobileViewport()) {
    els.quickAddStatus.value = lane;
  }

  if (persist) {
    try { localStorage.setItem('hq.activeLane', lane); } catch {}
  }

  // If we’re reflecting lane in the URL, do it immediately on tap (don’t wait for the next refresh/poll).
  if (reflectURL) updateURL();
}

function initMobileLaneSwitcher(initialLaneOverride = null) {
  if (!els.laneSwitcher) return;

  // Initial lane (URL param wins, then localStorage, then backlog)
  const saved = (() => {
    try { return localStorage.getItem('hq.activeLane'); } catch { return null; }
  })();

  const initialLane = (
    (initialLaneOverride && lanes.includes(initialLaneOverride) && initialLaneOverride) ||
    (saved && lanes.includes(saved) && saved) ||
    'backlog'
  );

  setActiveLane(initialLane, { persist: false, reflectURL: !!initialLaneOverride });

  // Click tabs
  els.laneTabBtns.forEach(btn => {
    btn.addEventListener('click', () => setActiveLane(btn.getAttribute('data-tab')));
  });

  // Keyboard support (left/right within tablist)
  els.laneSwitcher.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const currentIdx = Math.max(0, lanes.indexOf(activeLane));
    const nextIdx = e.key === 'ArrowRight'
      ? Math.min(lanes.length - 1, currentIdx + 1)
      : Math.max(0, currentIdx - 1);
    setActiveLane(lanes[nextIdx]);
    const nextBtn = els.laneTabBtns.find(b => b.getAttribute('data-tab') === lanes[nextIdx]);
    nextBtn?.focus();
    e.preventDefault();
  });

  // Optional horizontal swipe between lanes (avoid interfering with card swipe/scroll)
  let startX = 0;
  let startY = 0;
  let startT = 0;

  const board = document.getElementById('kanban-board');
  if (!board) return;

  board.addEventListener('touchstart', (e) => {
    // Ignore swipes starting on a card (cards already use swipe-left for archive)
    if (e.target.closest?.('.card')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = Date.now();
  }, { passive: true });

  board.addEventListener('touchend', (e) => {
    if (!startX || !startY) return;
    if (!isMobileViewport()) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;
    const dt = Date.now() - startT;

    // Reset early
    startX = 0; startY = 0; startT = 0;

    // Only treat as lane swipe if horizontal movement is dominant & fast enough
    if (Math.abs(diffX) < 70) return;
    if (Math.abs(diffX) < Math.abs(diffY) * 1.5) return;
    if (dt > 800) return;

    const idx = Math.max(0, lanes.indexOf(activeLane));
    if (diffX < 0 && idx < lanes.length - 1) {
      // swipe left → next lane
      setActiveLane(lanes[idx + 1]);
    } else if (diffX > 0 && idx > 0) {
      // swipe right → previous lane
      setActiveLane(lanes[idx - 1]);
    }
  }, { passive: true });
}

function handleViewportChange() {
  // When transitioning to desktop, show all columns; when back to mobile, show active
  const cols = document.querySelectorAll('[data-lane-col]');
  if (!cols.length) return;

  if (!isMobileViewport()) {
    cols.forEach(col => col.classList.add('active'));
  } else {
    setActiveLane(activeLane || 'backlog', { persist: false, reflectURL: false });
    setMobileSearchExpanded(!!searchQuery, { focus: false });
  }
}


function showToast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.className = `fixed bottom-4 right-4 z-50 glass rounded-xl px-4 py-3 shadow-lg ${type === 'error' ? 'border border-red-500/50' : ''}`;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 3000);
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
}

function cardEl(card) {
  const div = document.createElement('div');
  div.className = `card rounded-2xl px-3 py-2 flex items-start justify-between gap-3 ${card.priority ? `priority-${card.priority}` : ''} ${isOverdue(card.dueDate) ? 'overdue' : ''}`;
  div.setAttribute('data-card-id', card.id);
  div.setAttribute('role', 'listitem');
  div.setAttribute('tabindex', '0');
  div.setAttribute('aria-label', `Card: ${card.title}`);

  const left = document.createElement('div');
  left.className = 'min-w-0 flex-1';

  const title = document.createElement('div');
  title.className = 'text-sm text-white/90 leading-snug break-words font-medium';
  title.textContent = card.title;

  const meta = document.createElement('div');
  meta.className = 'flex items-center gap-2 mt-2 flex-wrap';

  // Labels
  if (card.labels && card.labels.length > 0) {
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'flex gap-1 flex-wrap';
    card.labels.forEach(label => {
      const labelEl = document.createElement('span');
      labelEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70';
      labelEl.textContent = label;
      labelsContainer.appendChild(labelEl);
    });
    meta.appendChild(labelsContainer);
  }

  // Priority badge
  if (card.priority) {
    const priorityEl = document.createElement('span');
    priorityEl.className = 'text-[10px] px-2 py-0.5 rounded-full font-medium uppercase';
    priorityEl.textContent = card.priority;
    priorityEl.style.background = `${priorityColors[card.priority]}40`;
    priorityEl.style.color = priorityColors[card.priority];
    meta.appendChild(priorityEl);
  }

  // Due date
  if (card.dueDate) {
    const dueEl = document.createElement('span');
    dueEl.className = `text-[10px] px-2 py-0.5 rounded-full ${isOverdue(card.dueDate) ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/70'}`;
    dueEl.textContent = isOverdue(card.dueDate) ? 'Overdue' : new Date(card.dueDate).toLocaleDateString();
    meta.appendChild(dueEl);
  }

  const timeEl = document.createElement('div');
  timeEl.className = 'text-[11px] text-white/40 mono mt-1';
  timeEl.textContent = formatDate(card.updatedAt);

  left.appendChild(title);
  if (meta.children.length > 0) left.appendChild(meta);
  left.appendChild(timeEl);

  const right = document.createElement('div');
  // Allow wrapping on mobile so quick actions don't crowd the title.
  right.className = 'flex items-center gap-1.5 flex-shrink-0 flex-wrap md:flex-nowrap justify-end';

  const dragHandle = document.createElement('button');
  dragHandle.className = 'drag-handle w-10 h-10 md:w-8 md:h-8 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 touch-manipulation';
  dragHandle.title = 'Drag to reorder';
  dragHandle.setAttribute('aria-label', 'Drag to reorder');
  dragHandle.innerHTML = '⠿';
  // Avoid opening the modal when tapping the handle.
  dragHandle.addEventListener('click', (e) => e.stopPropagation());
  dragHandle.addEventListener('pointerdown', (e) => e.stopPropagation());
  dragHandle.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

  async function setStatus(nextStatus, { toast } = {}) {
    if (!nextStatus || card.status === nextStatus) return;
    try {
      await api(`/api/cards/${card.id}`, { method: 'PATCH', body: { status: nextStatus } });
      await refreshBoard();
      if (toast) showToast(toast);
    } catch (e) {
      showToast(`Failed to mark ${nextStatus}`, 'error');
    }
  }

  async function archiveCard({ confirmFirst = true } = {}) {
    // Keep prompts minimal: only destructive actions confirm.
    if (confirmFirst && !confirm('Archive this card?')) return;
    try {
      await api(`/api/cards/${card.id}/archive`, { method: 'POST' });
      await refreshBoard();
      showToast('Card archived');
    } catch (e) {
      showToast('Failed to archive card', 'error');
    }
  }

  function makeIconBtn({ title, ariaLabel, html, className, disabled, onClick }) {
    const btn = document.createElement('button');
    btn.className = className;
    if (title) btn.title = title;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    if (html != null) btn.innerHTML = html;
    btn.disabled = !!disabled;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick?.(e);
    });
    return btn;
  }

  function makeMobileActionBtn({ label, ariaLabel, className, onClick, disabled }) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', ariaLabel || label);
    btn.disabled = !!disabled;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick?.(e);
    });
    return btn;
  }

  // Desktop quick actions (icons) live on the right.
  // Mobile gets a dedicated 1-tap action row below the card content.
  const doneBtn = makeIconBtn({
    title: 'Mark done',
    ariaLabel: 'Mark card done',
    html: '✓',
    className: `hidden md:inline-flex items-center justify-center w-9 h-9 md:w-8 md:h-8 rounded-xl border border-white/10 ${card.status === 'done' ? 'text-green-300/50' : 'text-green-300'} hover:text-white hover:bg-white/5 touch-manipulation`,
    disabled: card.status === 'done',
    onClick: () => setStatus('done', { toast: 'Marked done' })
  });

  const blockedBtn = makeIconBtn({
    title: 'Mark blocked',
    ariaLabel: 'Mark card blocked',
    html: '!',
    className: `hidden md:inline-flex items-center justify-center w-9 h-9 md:w-8 md:h-8 rounded-xl border border-white/10 ${card.status === 'blocked' ? 'text-yellow-300/50' : 'text-yellow-300'} hover:text-white hover:bg-white/5 touch-manipulation`,
    disabled: card.status === 'blocked',
    onClick: () => setStatus('blocked', { toast: 'Marked blocked' })
  });

  const editBtn = makeIconBtn({
    title: 'Edit card',
    ariaLabel: 'Edit card',
    html: '✎',
    className: 'inline-flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 touch-manipulation',
    onClick: () => openCardModal(card)
  });

  const archiveBtn = makeIconBtn({
    title: 'Archive',
    ariaLabel: 'Archive card',
    html: '×',
    className: 'hidden md:inline-flex items-center justify-center w-10 h-10 md:w-8 md:h-8 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 touch-manipulation',
    onClick: () => archiveCard({ confirmFirst: true })
  });

  // Mobile quick actions row (1-tap) — only on small screens.
  const mobileActions = document.createElement('div');
  mobileActions.className = 'md:hidden mt-2 flex items-center gap-2';

  const mobileDone = makeMobileActionBtn({
    label: 'Done',
    ariaLabel: 'Mark card done',
    className: `flex-1 h-10 rounded-xl border border-white/10 ${card.status === 'done' ? 'text-green-300/50' : 'text-green-300'} hover:text-white hover:bg-white/5 touch-manipulation`,
    disabled: card.status === 'done',
    onClick: () => setStatus('done', { toast: 'Marked done' })
  });

  const mobileBlocked = makeMobileActionBtn({
    label: 'Blocked',
    ariaLabel: 'Mark card blocked',
    className: `flex-1 h-10 rounded-xl border border-white/10 ${card.status === 'blocked' ? 'text-yellow-300/50' : 'text-yellow-300'} hover:text-white hover:bg-white/5 touch-manipulation`,
    disabled: card.status === 'blocked',
    onClick: () => setStatus('blocked', { toast: 'Marked blocked' })
  });

  const mobileArchive = makeMobileActionBtn({
    label: 'Archive',
    ariaLabel: 'Archive card',
    className: 'flex-1 h-10 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 touch-manipulation',
    onClick: () => archiveCard({ confirmFirst: true })
  });

  mobileActions.appendChild(mobileDone);
  mobileActions.appendChild(mobileBlocked);
  mobileActions.appendChild(mobileArchive);
  left.appendChild(mobileActions);

  // Mobile swipe gesture for archive
  let touchStartX = 0;
  let touchStartY = 0;
  div.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  div.addEventListener('touchend', (e) => {
    if (!touchStartX || !touchStartY) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchStartX - touchEndX; // + = swipe left, - = swipe right
    const diffY = touchStartY - touchEndY;

    const isHorizontal = Math.abs(diffX) > Math.abs(diffY) * 1.25;
    const isSwipe = Math.abs(diffX) > 110;

    if (isHorizontal && isSwipe) {
      e.preventDefault();

      // Swipe right → done (non-destructive, no confirm)
      if (diffX < 0 && card.status !== 'done') {
        api(`/api/cards/${card.id}`, { method: 'PATCH', body: { status: 'done' } }).then(() => {
          refreshBoard();
          showToast('Marked done');
        }).catch(() => {
          showToast('Failed to mark done', 'error');
        });
      }

      // Swipe left → archive (destructive, confirm)
      if (diffX > 0) {
        if (confirm('Archive this card?')) {
          api(`/api/cards/${card.id}/archive`, { method: 'POST' }).then(() => {
            refreshBoard();
            showToast('Card archived');
          }).catch(() => {
            showToast('Failed to archive card', 'error');
          });
        }
      }
    }

    touchStartX = 0;
    touchStartY = 0;
  });

  right.appendChild(dragHandle);
  right.appendChild(doneBtn);
  right.appendChild(blockedBtn);
  right.appendChild(editBtn);
  right.appendChild(archiveBtn);

  div.appendChild(left);
  div.appendChild(right);

  // Click to open modal
  div.addEventListener('click', () => openCardModal(card));
  
  // Keyboard navigation
  div.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCardModal(card);
    }
  });

  return div;
}

function openCardModal(card) {
  const isMobile = window.innerWidth < 768;

  const quickActionsHtml = isMobile ? `
    <div class="glass rounded-2xl p-3 border border-white/10">
      <div class="text-xs text-white/50 mb-2 uppercase tracking-widest">Quick actions</div>
      <div class="grid grid-cols-3 gap-2">
        <button type="button" id="qa-done" class="btn btn-secondary w-full min-h-[44px]" aria-label="Mark done">✓ Done</button>
        <button type="button" id="qa-blocked" class="btn btn-secondary w-full min-h-[44px]" aria-label="Mark blocked">! Blocked</button>
        <button type="button" id="qa-archive" class="btn btn-secondary w-full min-h-[44px]" aria-label="Archive card">× Archive</button>
      </div>

      <div class="mt-3">
        <div class="text-[11px] text-white/40 mb-1">Move (no drag)</div>
        <select id="qa-move" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-base text-white min-h-[44px]" aria-label="Move card">
          ${lanes.map(s => `<option value="${s}" ${s === card.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="text-[11px] text-white/35 mt-2">Tip: scrolling won’t start a drag — use the ⠿ handle to reorder.</div>
    </div>
  ` : '';

  els.modalContent.innerHTML = `
    <form id="card-form" class="space-y-4 ${isMobile ? 'pb-24' : ''}">
      ${quickActionsHtml}
      <div>
        <label class="block text-sm font-medium mb-1">Title</label>
        <input type="text" id="card-title" value="${escapeHtml(card.title)}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'} text-white min-h-[44px]" maxlength="140" required />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Description</label>
        <textarea id="card-description" rows="${isMobile ? 3 : 4}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 ${isMobile ? 'py-3 text-base min-h-[96px]' : 'py-2 text-sm'} text-white" placeholder="Add a description...">${escapeHtml(card.description || '')}</textarea>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label class="block text-sm font-medium">Attachments</label>
          <span class="text-[11px] text-white/35">images only</span>
        </div>
        <div id="attachments-grid" class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2"></div>
        <div id="attachments-upload" class="mt-2 flex items-center gap-2">
          <input id="attachment-file" type="file" accept="image/jpeg,image/png,image/webp" class="block w-full text-xs text-white/70" />
          <button type="button" id="upload-attachment" class="btn btn-secondary min-h-[44px]">Upload</button>
        </div>
        <div id="attachments-hint" class="text-[11px] text-white/35 mt-1"></div>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label class="block text-sm font-medium">Comments</label>
          <span class="text-[11px] text-white/35">persisted</span>
        </div>
        <div id="comments-list" class="mt-2 space-y-2"></div>
        <textarea id="new-comment" rows="${isMobile ? 3 : 2}" class="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-3 ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'} text-white" placeholder="Add a comment..."></textarea>
        <div class="mt-2 flex justify-end">
          <button type="button" id="add-comment" class="btn btn-secondary min-h-[44px]">Add comment</button>
        </div>
      </div>

      <div class="grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-2'} gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Status</label>
          <select id="card-status" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'} text-white min-h-[44px]">
            ${lanes.map(s => `<option value="${s}" ${s === card.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Priority</label>
          <select id="card-priority" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'} text-white min-h-[44px]">
            <option value="">None</option>
            ${priorities.map(p => `<option value="${p}" ${p === card.priority ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Due Date</label>
        <input type="date" id="card-due-date" value="${card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : ''}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'} text-white min-h-[44px]" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Labels (comma-separated)</label>
        <input type="text" id="card-labels" value="${card.labels ? card.labels.join(', ') : ''}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 ${isMobile ? 'py-3 text-base' : 'py-2 text-sm'} text-white min-h-[44px]" placeholder="bug, feature, urgent" />
      </div>
      <div class="card-modal-actions sticky bottom-0 ${isMobile ? '-mx-6 px-6' : ''} pt-3 pb-4 mt-4 bg-black/30 backdrop-blur border-t border-white/10">
        <div class="${isMobile ? 'grid grid-cols-2 gap-2' : 'flex flex-row gap-2 justify-end'}">
          <button type="button" id="cancel-card" class="btn btn-secondary min-h-[44px] ${isMobile ? 'w-full' : ''}">Cancel</button>
          <button type="submit" class="btn btn-primary min-h-[44px] ${isMobile ? 'w-full' : ''}">Save</button>
        </div>
      </div>
    </form>
  `;

  updateViewportVars();
  document.body.classList.add('modal-open');

  els.cardModal.classList.remove('hidden');
  els.cardModal.classList.add('flex');
  document.getElementById('card-title').focus();

  // Load comments + attachments (async; no need to wait for Save)
  initCardExtras(card);

  // Mobile-only quick actions (1 tap)
  if (isMobile) {
    const qaDone = document.getElementById('qa-done');
    const qaBlocked = document.getElementById('qa-blocked');
    const qaArchive = document.getElementById('qa-archive');
    const qaMove = document.getElementById('qa-move');

    if (qaDone) {
      qaDone.disabled = card.status === 'done';
      qaDone.addEventListener('click', async () => {
        if (card.status === 'done') return;
        try {
          await api(`/api/cards/${card.id}`, { method: 'PATCH', body: { status: 'done' } });
          closeCardModal();
          await refreshBoard();
          showToast('Marked done');
        } catch {
          showToast('Failed to mark done', 'error');
        }
      });
    }

    if (qaBlocked) {
      qaBlocked.disabled = card.status === 'blocked';
      qaBlocked.addEventListener('click', async () => {
        if (card.status === 'blocked') return;
        try {
          await api(`/api/cards/${card.id}`, { method: 'PATCH', body: { status: 'blocked' } });
          closeCardModal();
          await refreshBoard();
          showToast('Marked blocked');
        } catch {
          showToast('Failed to mark blocked', 'error');
        }
      });
    }

    if (qaArchive) {
      qaArchive.addEventListener('click', async () => {
        if (!confirm('Archive this card?')) return;
        try {
          await api(`/api/cards/${card.id}/archive`, { method: 'POST' });
          closeCardModal();
          await refreshBoard();
          showToast('Card archived');
        } catch {
          showToast('Failed to archive card', 'error');
        }
      });
    }

    if (qaMove) {
      // If the user changes lanes, move immediately (no Save required).
      qaMove.addEventListener('change', async (e) => {
        const next = e.target.value;
        if (!next || next === card.status) return;
        try {
          await api(`/api/cards/${card.id}`, { method: 'PATCH', body: { status: next } });
          closeCardModal();
          await refreshBoard();
          showToast('Card moved');
        } catch {
          showToast('Failed to move card', 'error');
          // Re-sync the select back to the current status.
          e.target.value = card.status;
        }
      });
    }
  }

  document.getElementById('card-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('card-title').value.trim();
    if (!title) return;

    const labels = document.getElementById('card-labels').value.split(',').map(s => s.trim()).filter(Boolean);
    const dueDate = document.getElementById('card-due-date').value || null;

    try {
      await api(`/api/cards/${card.id}`, {
        method: 'PATCH',
        body: {
          title,
          description: document.getElementById('card-description').value.trim() || null,
          status: document.getElementById('card-status').value,
          priority: document.getElementById('card-priority').value || null,
          labels,
          dueDate: dueDate ? new Date(dueDate).getTime() : null
        }
      });
      closeCardModal();
      await refreshBoard();
      showToast('Card updated');
    } catch (e) {
      showToast('Failed to update card', 'error');
    }
  });

  document.getElementById('cancel-card').addEventListener('click', closeCardModal);
}

function closeCardModal() {
  els.cardModal.classList.add('hidden');
  els.cardModal.classList.remove('flex');
  // Only clear the lock if quick-add isn’t open.
  if (!els.quickAddModal || els.quickAddModal.classList.contains('hidden')) {
    document.body.classList.remove('modal-open');
  }
}

function openQuickAdd({ status } = {}) {
  if (!els.quickAddModal) return;

  // Default to active lane on mobile, else backlog.
  const defaultStatus = status || (isMobileViewport() ? (activeLane || 'backlog') : 'backlog');
  if (els.quickAddStatus) els.quickAddStatus.value = defaultStatus;

  updateViewportVars();
  document.body.classList.add('modal-open');

  els.quickAddModal.classList.remove('hidden');
  els.quickAddModal.classList.add('flex');

  // Reset title each time.
  if (els.quickAddTitle) {
    els.quickAddTitle.value = '';
    // Let layout settle so focus doesn't get dropped on iOS.
    setTimeout(() => els.quickAddTitle?.focus(), 50);
  }
}

function closeQuickAdd() {
  if (!els.quickAddModal) return;
  els.quickAddModal.classList.add('hidden');
  els.quickAddModal.classList.remove('flex');
  // Only clear the lock if card modal isn’t open.
  if (els.cardModal.classList.contains('hidden')) {
    document.body.classList.remove('modal-open');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatSmallTime(ms) {
  try {
    const d = new Date(ms);
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function initCardExtras(card) {
  const commentsList = document.getElementById('comments-list');
  const addBtn = document.getElementById('add-comment');
  const newCommentEl = document.getElementById('new-comment');

  const attachmentsGrid = document.getElementById('attachments-grid');
  const uploadWrap = document.getElementById('attachments-upload');
  const uploadBtn = document.getElementById('upload-attachment');
  const fileEl = document.getElementById('attachment-file');
  const hintEl = document.getElementById('attachments-hint');

  // Render helpers
  const renderComments = (comments) => {
    if (!commentsList) return;
    if (!comments?.length) {
      commentsList.innerHTML = `<div class="text-xs text-white/40">No comments yet.</div>`;
      return;
    }

    commentsList.innerHTML = comments.map(c => `
      <div class="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <div class="text-[11px] text-white/55 mono">${escapeHtml(c.author || 'unknown')}</div>
          <div class="text-[11px] text-white/35">${formatSmallTime(c.createdAt)}</div>
        </div>
        <div class="mt-1 text-sm text-white/85 whitespace-pre-wrap">${escapeHtml(c.text || '')}</div>
      </div>
    `).join('');
  };

  const renderAttachments = (attachments, { error } = {}) => {
    if (!attachmentsGrid) return;

    if (error) {
      attachmentsGrid.innerHTML = `<div class="text-xs text-white/40">${escapeHtml(error)}</div>`;
      return;
    }

    if (!attachments?.length) {
      attachmentsGrid.innerHTML = `<div class="text-xs text-white/40">No attachments yet.</div>`;
      return;
    }

    attachmentsGrid.innerHTML = attachments.map(a => `
      <a href="${a.url}" target="_blank" rel="noreferrer" class="block bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20">
        <img src="${a.url}" alt="attachment" class="w-full h-28 object-cover" loading="lazy" />
        <div class="px-2 py-1 text-[10px] text-white/45 mono truncate">${escapeHtml(a.mimeType || '')} • ${Math.round((a.sizeBytes || 0) / 1024)}KB</div>
      </a>
    `).join('');
  };

  // Initial loads
  if (commentsList) commentsList.innerHTML = `<div class="text-xs text-white/40">Loading…</div>`;
  try {
    const data = await api(`/api/cards/${card.id}/comments`);
    renderComments(data.comments);
  } catch {
    renderComments([]);
  }

  if (attachmentsGrid) attachmentsGrid.innerHTML = `<div class="text-xs text-white/40">Loading…</div>`;
  try {
    const data = await api(`/api/cards/${card.id}/attachments`);
    renderAttachments(data.attachments);
    if (hintEl) hintEl.textContent = '';
  } catch (e) {
    // If not configured, show a gentle note.
    const msg = String(e?.message || 'Failed to load attachments');
    renderAttachments([], { error: msg.includes('attachments_not_configured') ? 'Attachments are not configured on this deployment.' : 'Failed to load attachments.' });
    if (uploadWrap) uploadWrap.classList.add('hidden');
    if (hintEl) hintEl.textContent = '';
  }

  // Add comment
  if (addBtn && newCommentEl) {
    addBtn.addEventListener('click', async () => {
      const text = newCommentEl.value.trim();
      if (!text) return;
      addBtn.disabled = true;
      try {
        await api(`/api/cards/${card.id}/comments`, { method: 'POST', body: { text } });
        newCommentEl.value = '';
        const data = await api(`/api/cards/${card.id}/comments`);
        renderComments(data.comments);
      } catch {
        showToast('Failed to add comment', 'error');
      } finally {
        addBtn.disabled = false;
      }
    });
  }

  // Upload attachment
  if (uploadBtn && fileEl) {
    uploadBtn.addEventListener('click', async () => {
      const file = fileEl.files?.[0];
      if (!file) return;

      uploadBtn.disabled = true;
      try {
        const fd = new FormData();
        fd.append('file', file);
        await apiUpload(`/api/cards/${card.id}/attachments`, fd);
        fileEl.value = '';
        const data = await api(`/api/cards/${card.id}/attachments`);
        renderAttachments(data.attachments);
      } catch {
        showToast('Failed to upload image', 'error');
      } finally {
        uploadBtn.disabled = false;
      }
    });
  }
}

function initSortable() {
  lanes.forEach(lane => {
    if (sortableInstances[lane]) {
      sortableInstances[lane].destroy();
    }

    sortableInstances[lane] = new Sortable(els.laneEls[lane], {
      group: 'kanban',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',

      // Touch-safe drag/drop:
      // - Only drag via explicit handle
      // - Require a long-press on touch to avoid accidental drags while scrolling
      // - Keep vertical scrolling working even if the user starts the gesture on/near the handle
      handle: '.drag-handle',
      delay: window.matchMedia?.('(pointer: coarse)').matches ? 550 : 0,
      delayOnTouchOnly: true,
      touchStartThreshold: 18,
      // Extra forgiveness before Sortable decides you meant to drag (helps mobile scroll).
      fallbackTolerance: 6,

      // When dragging, auto-scroll the lane so you can move cards further down.
      scroll: true,
      scrollSensitivity: 80,
      scrollSpeed: 12,

      onEnd: async (evt) => {
        const cardId = evt.item.getAttribute('data-card-id');
        const newStatus = evt.to.getAttribute('data-lane');
        const oldStatus = evt.from.getAttribute('data-lane');

        if (newStatus === oldStatus) {
          // Just reordering within same lane
          const cards = Array.from(evt.to.children).map((el, idx) => ({
            id: el.getAttribute('data-card-id'),
            sort: idx + 1
          }));

          // Update sort order for all cards in this lane
          for (const card of cards) {
            try {
              await api(`/api/cards/${card.id}`, {
                method: 'PATCH',
                body: { sort: card.sort }
              });
            } catch (e) {
              console.error('Failed to update sort order:', e);
            }
          }
        } else {
          // Moving between lanes
          try {
            await api(`/api/cards/${cardId}`, {
              method: 'PATCH',
              body: { status: newStatus }
            });
            await refreshBoard();
            showToast('Card moved');
          } catch (e) {
            showToast('Failed to move card', 'error');
            await refreshBoard(); // Revert on error
          }
        }
      }
    });
  });
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

async function apiUpload(path, formData, { method = 'POST' } = {}) {
  const res = await fetch(path, { method, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function refreshStatus() {
  try {
    const me = await api('/api/me');
    els.whoami.textContent = me.email ? `as ${me.email}` : '(dev)';

    const health = await api('/api/health');

    // Update health indicator
    if (els.healthIndicator) {
      const isHealthy = health.ok && health.db?.ok;
      els.healthIndicator.innerHTML = `
        <span class="w-2 h-2 rounded-full ${isHealthy ? 'bg-green-400' : 'bg-red-400'}"></span>
        <span class="text-sm">${isHealthy ? 'Operational' : 'Degraded'}</span>
      `;
    }

    // Update last update time
    if (els.lastUpdate) {
      els.lastUpdate.textContent = formatDate(Date.now());
    }

    // Update status summary
    const cards = await api('/api/cards');
    const activeCards = cards.cards.filter(c => !c.archived);
    const stats = {
      total: activeCards.length,
      backlog: activeCards.filter(c => c.status === 'backlog').length,
      doing: activeCards.filter(c => c.status === 'doing').length,
      blocked: activeCards.filter(c => c.status === 'blocked').length,
      done: activeCards.filter(c => c.status === 'done').length,
      overdue: activeCards.filter(c => isOverdue(c.dueDate)).length
    };

    els.statusSummary.innerHTML = `
      <div class="text-center bg-white/5 rounded-xl p-3">
        <div class="text-2xl font-bold">${stats.total}</div>
        <div class="text-xs text-white/60">Total</div>
      </div>
      <div class="text-center bg-white/5 rounded-xl p-3">
        <div class="text-2xl font-bold">${stats.doing}</div>
        <div class="text-xs text-white/60">Doing</div>
      </div>
      <div class="text-center bg-white/5 rounded-xl p-3">
        <div class="text-2xl font-bold ${stats.blocked > 0 ? 'text-yellow-400' : ''}">${stats.blocked}</div>
        <div class="text-xs text-white/60">Blocked</div>
      </div>
      <div class="text-center bg-white/5 rounded-xl p-3">
        <div class="text-2xl font-bold ${stats.overdue > 0 ? 'text-red-400' : ''}">${stats.overdue}</div>
        <div class="text-xs text-white/60">Overdue</div>
      </div>
    `;

    // Friday status
    const friday = await api('/api/friday-status');
    const mode = friday.status?.mode || 'idle';
    const rawMsg = friday.status?.message || '';
    const fallback = mode === 'working'
      ? 'Working…'
      : mode === 'waiting'
        ? 'Waiting for your next command…'
        : mode === 'sleeping'
          ? 'Sleeping (wake me if you need me).'
          : 'Idle — watching for new tasks.';

    const msg = rawMsg.trim() ? rawMsg : fallback;

    if (els.fridayMessage) els.fridayMessage.textContent = msg;

    // Slack/Teams-style mode pill + dot
    const dotClass = mode === 'working'
      ? 'bg-green-400'
      : mode === 'waiting'
        ? 'bg-yellow-400'
        : mode === 'sleeping'
          ? 'bg-indigo-400'
          : 'bg-white/40';

    if (els.fridayMode) els.fridayMode.dataset.mode = mode;
    if (els.fridayModeText) els.fridayModeText.textContent = mode;
    if (els.fridayDot) {
      els.fridayDot.className = `w-2 h-2 rounded-full ${dotClass}`;
    }

    if (els.fridayUpdated) {
      els.fridayUpdated.textContent = friday.status?.updatedAt ? `updated ${formatDate(friday.status.updatedAt)}` : 'not set';
    }
    if (els.fridayFocus) {
      els.fridayFocus.textContent = friday.status?.focusCardId ? friday.status.focusCardId : '(none)';
    }

    els.status.textContent = JSON.stringify({ me, health, stats, friday }, null, 2);
  } catch (e) {
    els.status.textContent = String(e?.message || e);
    if (els.healthIndicator) {
      els.healthIndicator.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-red-400"></span>
        <span class="text-sm">Error</span>
      `;
    }
  }
}

function matchesFilter(card) {
  // Search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    const matchesTitle = card.title.toLowerCase().includes(query);
    const matchesDescription = (card.description || '').toLowerCase().includes(query);
    const matchesLabels = (card.labels || []).some(label => label.toLowerCase().includes(query));
    if (!matchesTitle && !matchesDescription && !matchesLabels) {
      return false;
    }
  }

  // Status filter
  if (filterStatus && card.status !== filterStatus) {
    return false;
  }

  // Priority filter
  if (filterPriority && card.priority !== filterPriority) {
    return false;
  }

  // Archived filter
  if (!showArchived && card.archived) {
    return false;
  }

  return true;
}

function hashStringDJB2(str) {
  // Tiny non-crypto hash to cheaply detect changes without JSON.stringify().
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return h >>> 0;
}

function laneSignature(cards) {
  // Include fields that affect ordering + rendering.
  // Keep it lightweight: a single concatenated string then hashed.
  let s = '';
  for (const c of cards) {
    s += `${c.id}|${c.updatedAt}|${c.sort}|${c.archived ? 1 : 0}|${c.status}|${c.priority || ''};`;
  }
  return hashStringDJB2(s);
}

let refreshBoardQueued = false;
let refreshBoardInFlight = false;
let refreshBoardRequestedWhileInFlight = false;

function scheduleRefreshBoard() {
  if (refreshBoardQueued) return;
  refreshBoardQueued = true;
  requestAnimationFrame(async () => {
    refreshBoardQueued = false;
    await refreshBoard();
  });
}

async function refreshBoard() {
  // Avoid overlapping refreshes (typing + polling + drag events).
  if (refreshBoardInFlight) {
    refreshBoardRequestedWhileInFlight = true;
    return;
  }

  refreshBoardInFlight = true;
  try {
    const url = showArchived ? '/api/cards?archived=true' : '/api/cards';
    const data = await api(url);
    const newUpdateTime = Date.now();

    const nextCardsData = Object.fromEntries((data.cards || []).map(c => [c.id, c]));

    // Build filtered, per-lane lists
    const byLane = Object.fromEntries(lanes.map(s => [s, []]));
    for (const c of (data.cards || [])) {
      if (matchesFilter(c)) byLane[c.status].push(c);
    }

    // Sort by sort field, then by updated_at
    for (const s of lanes) {
      byLane[s].sort((a, b) => {
        if (a.sort !== b.sort) return a.sort - b.sort;
        return b.updatedAt - a.updatedAt;
      });
    }

    // Change detection (cheap hash per lane)
    const nextLaneSigs = Object.fromEntries(lanes.map(s => [s, laneSignature(byLane[s]) ]));

    const anyLaneChanged = lanes.some(s => nextLaneSigs[s] !== lastLaneSigs[s]);

    // Toast only when polling detects a change (and not on first load)
    if (lastUpdateTime && anyLaneChanged) {
      showToast('Board updated', 'info');
    }
    lastUpdateTime = newUpdateTime;

    // Commit latest data snapshot
    cardsData = nextCardsData;

    // Batch DOM writes: only update lanes that changed
    for (const s of lanes) {
      const laneEl = els.laneEls[s];
      if (!laneEl) continue;

      const sig = nextLaneSigs[s];
      if (sig !== lastLaneSigs[s]) {
        const frag = document.createDocumentFragment();
        for (const c of byLane[s]) frag.appendChild(cardEl(c));
        // replaceChildren is faster + avoids intermediate HTML parsing.
        laneEl.replaceChildren(frag);
        lastLaneSigs[s] = sig;
      }

      const n = byLane[s].length;
      (els.countEls[s] || []).forEach(el => {
        if (el.textContent !== String(n)) el.textContent = String(n);
      });
    }

    // Update URL with filter state (only when it actually changes)
    updateURL();

    // Sortable should be created once; updating children is fine.
    if (!sortableInitialized) {
      initSortable();
      sortableInitialized = true;
    }
  } catch (e) {
    showToast('Failed to refresh board', 'error');
    console.error(e);
  } finally {
    refreshBoardInFlight = false;
    if (refreshBoardRequestedWhileInFlight) {
      refreshBoardRequestedWhileInFlight = false;
      scheduleRefreshBoard();
    }
  }
}

function updateURL() {
  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  if (filterStatus) params.set('status', filterStatus);
  if (filterPriority) params.set('priority', filterPriority);
  if (showArchived) params.set('archived', 'true');

  // Optional: reflect active mobile lane in the URL.
  // Keep it stable if it was present in the URL, so refreshBoard() doesn't strip it.
  if (activeLane && (isMobileViewport() || laneParamSeen)) {
    params.set('lane', activeLane);
  }

  const newURL = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  if (newURL === lastURL) return;
  lastURL = newURL;
  window.history.replaceState({}, '', newURL);
}

function loadFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  searchQuery = params.get('q') || '';
  filterStatus = params.get('status') || null;
  filterPriority = params.get('priority') || null;
  showArchived = params.get('archived') === 'true';

  const urlLane = params.get('lane');
  if (urlLane && lanes.includes(urlLane)) {
    activeLane = urlLane;
    laneParamSeen = true;
  }

  if (els.searchInput) els.searchInput.value = searchQuery;
  if (els.mobileSearchInput) els.mobileSearchInput.value = searchQuery;

  els.clearSearch?.classList.toggle('hidden', !searchQuery);
  els.mobileClearSearch?.classList.toggle('hidden', !searchQuery);

  // Mobile search is collapsed by default, but if a query is present (URL or prior state)
  // we expand it so users can see/clear it.
  if (isMobileViewport()) {
    setMobileSearchExpanded(!!searchQuery, { focus: false });
  }
}

function startPolling() {
  if (pollingInterval) return;
  
  pollingInterval = setInterval(async () => {
    // Only poll if tab is visible
    if (!document.hidden) {
      await refreshBoard();
    }
  }, 30000); // 30 seconds
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      if (e.key === 'Escape') {
        closeQuickAdd();
        closeCardModal();
        els.shortcutsModal.classList.add('hidden');
        els.shortcutsModal.classList.remove('flex');
      }
      return;
    }

    switch (e.key) {
      case 'n':
        e.preventDefault();
        if (isMobileViewport()) {
          openQuickAdd();
        } else {
          els.input.focus();
        }
        break;
      case '/':
        e.preventDefault();
        if (isMobileViewport()) {
          setMobileSearchExpanded(true, { focus: true });
        } else {
          els.searchInput?.focus();
        }
        break;
      case '?':
        e.preventDefault();
        showShortcutsModal();
        break;
      case 'Escape':
        closeQuickAdd();
        closeCardModal();
        els.shortcutsModal.classList.add('hidden');
        els.shortcutsModal.classList.remove('flex');
        break;
    }
  });
}

function setupSearch() {
  const inputs = [els.searchInput, els.mobileSearchInput].filter(Boolean);
  const clearBtns = [els.clearSearch, els.mobileClearSearch].filter(Boolean);
  if (!inputs.length) return;

  let t = null;
  const trigger = () => {
    if (t) clearTimeout(t);
    // Debounce typing to avoid rebuilding the DOM on every keypress.
    t = setTimeout(() => scheduleRefreshBoard(), 150);
  };

  const setAllValues = (value) => {
    inputs.forEach(i => {
      if (i.value !== value) i.value = value;
    });
  };

  const setClearVisible = (visible) => {
    clearBtns.forEach(b => b.classList.toggle('hidden', !visible));
  };

  inputs.forEach(input => {
    input.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      setAllValues(searchQuery);
      setClearVisible(!!searchQuery);

      // Keep the mobile toggle styling + clear button state in sync.
      if (isMobileViewport()) setMobileSearchExpanded(mobileSearchExpanded);

      trigger();
    });
  });

  clearBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      searchQuery = '';
      setAllValues('');
      setClearVisible(false);
      scheduleRefreshBoard();

      if (isMobileViewport()) {
        // Return to compact mode after clearing.
        setMobileSearchExpanded(false);
      }
    });
  });
}

function showShortcutsModal() {
  els.shortcutsContent.innerHTML = `
    <div class="space-y-3">
      <div class="flex justify-between items-center">
        <span>Create new task</span>
        <kbd class="px-2 py-1 bg-white/10 border border-white/20 rounded">n</kbd>
      </div>
      <div class="flex justify-between items-center">
        <span>Search cards</span>
        <kbd class="px-2 py-1 bg-white/10 border border-white/20 rounded">/</kbd>
      </div>
      <div class="flex justify-between items-center">
        <span>Show shortcuts</span>
        <kbd class="px-2 py-1 bg-white/10 border border-white/20 rounded">?</kbd>
      </div>
      <div class="flex justify-between items-center">
        <span>Close modal</span>
        <kbd class="px-2 py-1 bg-white/10 border border-white/20 rounded">Esc</kbd>
      </div>
      <div class="flex justify-between items-center">
        <span>Open card</span>
        <kbd class="px-2 py-1 bg-white/10 border border-white/20 rounded">Enter</kbd>
      </div>
    </div>
  `;
  els.shortcutsModal.classList.remove('hidden');
  els.shortcutsModal.classList.add('flex');
}

// Event listeners
els.mobileHelp?.addEventListener('click', () => showShortcutsModal());

els.mobileSearchToggle?.addEventListener('click', () => {
  // Toggle expansion. If a query is active, we keep it expanded (see setMobileSearchExpanded).
  setMobileSearchExpanded(!mobileSearchExpanded, { focus: true });
});

// Collapse on outside tap (mobile only) when the query is empty.
document.addEventListener('click', (e) => {
  if (!isMobileViewport()) return;
  if (!mobileSearchExpanded) return;
  if (searchQuery) return;

  const wrap = els.mobileSearchWrap;
  const toggle = els.mobileSearchToggle;
  const clickedInside = wrap?.contains(e.target) || toggle?.contains(e.target);
  if (!clickedInside) setMobileSearchExpanded(false);
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = els.input.value.trim();
  if (!title) return;
  els.input.value = '';
  try {
    await api('/api/cards', { method: 'POST', body: { title } });
    await refreshBoard();
    showToast('Card created');
  } catch (e) {
    showToast('Failed to create card', 'error');
  }
});

els.refreshStatus.addEventListener('click', refreshStatus);
els.closeModal.addEventListener('click', closeCardModal);
els.closeShortcuts.addEventListener('click', () => {
  els.shortcutsModal.classList.add('hidden');
  els.shortcutsModal.classList.remove('flex');
});

// Mobile quick add
els.fabNewCard?.addEventListener('click', () => openQuickAdd());
els.closeQuickAdd?.addEventListener('click', closeQuickAdd);
els.quickAddModal?.addEventListener('click', (e) => {
  if (e.target === els.quickAddModal) closeQuickAdd();
});

els.quickAddForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = els.quickAddTitle?.value.trim();
  if (!title) return;

  const status = els.quickAddStatus?.value || (activeLane || 'backlog');

  try {
    await api('/api/cards', { method: 'POST', body: { title, status } });
    closeQuickAdd();
    await refreshBoard();

    // If user created into a different lane than they’re viewing, hop there.
    if (isMobileViewport() && status && status !== activeLane) setActiveLane(status);

    showToast('Card created');
  } catch (e) {
    showToast('Failed to create card', 'error');
  }
});

// Friday Status is intentionally read-only in the UI.
// It is updated by automation (and optionally protected by a write token) so it stays accurate.

// Close modals on backdrop click
els.cardModal.addEventListener('click', (e) => {
  if (e.target === els.cardModal) closeCardModal();
});
els.shortcutsModal.addEventListener('click', (e) => {
  if (e.target === els.shortcutsModal) {
    els.shortcutsModal.classList.add('hidden');
    els.shortcutsModal.classList.remove('flex');
  }
});

// Initialize
(async function main() {
  try {
    loadFiltersFromURL();
    await refreshStatus();
    await refreshBoard();
    setupKeyboardShortcuts();
    setupSearch();

    // If URL had lane=..., prefer it over localStorage.
    initMobileLaneSwitcher(activeLane);
    handleViewportChange();
    window.addEventListener('resize', handleViewportChange);

    // Keep bottom sheets keyboard-safe.
    updateViewportVars();
    window.addEventListener('resize', updateViewportVars);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportVars);
      window.visualViewport.addEventListener('scroll', updateViewportVars);
    }

    // iOS can be finicky about keeping focused inputs above the keyboard.
    // When a control inside a sheet receives focus, nudge it into view.
    document.addEventListener('focusin', maybeKeepFocusedControlVisible);
    document.addEventListener('focusout', () => setTimeout(updateViewportVars, 50));

    startPolling();
    
    // Pause polling when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
        refreshBoard(); // Refresh immediately when tab becomes visible
      }
    });
  } catch (e) {
    els.status.textContent = String(e?.message || e);
    showToast('Failed to load board', 'error');
  }
})();
