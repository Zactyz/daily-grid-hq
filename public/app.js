const lanes = ['backlog','doing','blocked','done'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const priorityColors = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444'
};

let sortableInstances = {};
let cardsData = {};
let pollingInterval = null;
let lastUpdateTime = null;

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
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  laneEls: Object.fromEntries(lanes.map(s => [s, document.querySelector(`[data-lane="${s}"]`)])),
  countEls: Object.fromEntries(lanes.map(s => [s, document.querySelector(`[data-count="${s}"]`)])),
  cardModal: document.getElementById('card-modal'),
  modalContent: document.getElementById('modal-content'),
  closeModal: document.getElementById('close-modal'),
  shortcutsModal: document.getElementById('shortcuts-modal'),
  shortcutsContent: document.getElementById('shortcuts-content'),
  closeShortcuts: document.getElementById('close-shortcuts'),
  toast: document.getElementById('toast')
};

let searchQuery = '';
let filterStatus = null;
let filterPriority = null;
let showArchived = false;

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
  div.className = `card rounded-2xl px-3 py-2 flex items-start justify-between gap-3 cursor-move ${card.priority ? `priority-${card.priority}` : ''} ${isOverdue(card.dueDate) ? 'overdue' : ''}`;
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
  right.className = 'flex items-center gap-1.5 flex-shrink-0';

  const editBtn = document.createElement('button');
  editBtn.className = 'w-10 h-10 md:w-8 md:h-8 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 touch-manipulation';
  editBtn.title = 'Edit card';
  editBtn.setAttribute('aria-label', 'Edit card');
  editBtn.innerHTML = '✎';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openCardModal(card);
  });

  const archiveBtn = document.createElement('button');
  archiveBtn.className = 'w-10 h-10 md:w-8 md:h-8 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 touch-manipulation';
  archiveBtn.title = 'Archive';
  archiveBtn.setAttribute('aria-label', 'Archive card');
  archiveBtn.textContent = '×';
  archiveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Archive this card?')) return;
    try {
      await api(`/api/cards/${card.id}/archive`, { method: 'POST' });
      await refreshBoard();
      showToast('Card archived');
    } catch (e) {
      showToast('Failed to archive card', 'error');
    }
  });

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
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;

    // Swipe left (archive) - only if horizontal swipe is dominant
    if (Math.abs(diffX) > Math.abs(diffY) && diffX > 100 && Math.abs(diffX) > 50) {
      e.preventDefault();
      if (confirm('Archive this card?')) {
        api(`/api/cards/${card.id}/archive`, { method: 'POST' }).then(() => {
          refreshBoard();
          showToast('Card archived');
        }).catch(() => {
          showToast('Failed to archive card', 'error');
        });
      }
    }

    touchStartX = 0;
    touchStartY = 0;
  });

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
  els.modalContent.innerHTML = `
    <form id="card-form" class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Title</label>
        <input type="text" id="card-title" value="${escapeHtml(card.title)}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]" maxlength="140" required />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Description</label>
        <textarea id="card-description" rows="${isMobile ? 3 : 4}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" placeholder="Add a description...">${escapeHtml(card.description || '')}</textarea>
      </div>
      <div class="grid grid-cols-1 ${isMobile ? '' : 'md:grid-cols-2'} gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Status</label>
          <select id="card-status" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]">
            ${lanes.map(s => `<option value="${s}" ${s === card.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Priority</label>
          <select id="card-priority" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]">
            <option value="">None</option>
            ${priorities.map(p => `<option value="${p}" ${p === card.priority ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Due Date</label>
        <input type="date" id="card-due-date" value="${card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : ''}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Labels (comma-separated)</label>
        <input type="text" id="card-labels" value="${card.labels ? card.labels.join(', ') : ''}" class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white min-h-[44px]" placeholder="bug, feature, urgent" />
      </div>
      <div class="flex flex-col ${isMobile ? '' : 'md:flex-row'} gap-2 ${isMobile ? '' : 'md:justify-end'}">
        <button type="button" id="cancel-card" class="btn btn-secondary min-h-[44px]">Cancel</button>
        <button type="submit" class="btn btn-primary min-h-[44px]">Save</button>
      </div>
    </form>
  `;

  els.cardModal.classList.remove('hidden');
  els.cardModal.classList.add('flex');
  document.getElementById('card-title').focus();

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
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
      handle: '.card',
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

async function refreshStatus() {
  try {
    const me = await api('/api/me');
    els.whoami.textContent = me.email ? `as ${me.email}` : '(dev)';

    const health = await api('/api/health');
    els.status.textContent = JSON.stringify({ me, health }, null, 2);

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

async function refreshBoard() {
  try {
    const url = showArchived ? '/api/cards?archived=true' : '/api/cards';
    const data = await api(url);
    const newUpdateTime = Date.now();
    
    // Detect changes for polling
    if (lastUpdateTime && JSON.stringify(data.cards) !== JSON.stringify(Object.values(cardsData))) {
      showToast('Board updated', 'info');
    }
    lastUpdateTime = newUpdateTime;

    cardsData = Object.fromEntries((data.cards || []).map(c => [c.id, c]));
    const byLane = Object.fromEntries(lanes.map(s => [s, []]));
    
    for (const c of (data.cards || [])) {
      if (matchesFilter(c)) {
        byLane[c.status].push(c);
      }
    }

    // Sort by sort field, then by updated_at
    for (const s of lanes) {
      byLane[s].sort((a, b) => {
        if (a.sort !== b.sort) return a.sort - b.sort;
        return b.updatedAt - a.updatedAt;
      });
    }

    for (const s of lanes) {
      const lane = els.laneEls[s];
      lane.innerHTML = '';
      for (const c of byLane[s]) {
        lane.appendChild(cardEl(c));
      }
      els.countEls[s].textContent = String(byLane[s].length);
    }

    // Update URL with filter state
    updateURL();

    // Reinitialize sortable after DOM update
    initSortable();
  } catch (e) {
    showToast('Failed to refresh board', 'error');
    console.error(e);
  }
}

function updateURL() {
  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  if (filterStatus) params.set('status', filterStatus);
  if (filterPriority) params.set('priority', filterPriority);
  if (showArchived) params.set('archived', 'true');
  
  const newURL = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.replaceState({}, '', newURL);
}

function loadFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  searchQuery = params.get('q') || '';
  filterStatus = params.get('status') || null;
  filterPriority = params.get('priority') || null;
  showArchived = params.get('archived') === 'true';

  if (els.searchInput) els.searchInput.value = searchQuery;
  els.clearSearch.classList.toggle('hidden', !searchQuery);
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
        closeCardModal();
        els.shortcutsModal.classList.add('hidden');
      }
      return;
    }

    switch (e.key) {
      case 'n':
        e.preventDefault();
        els.input.focus();
        break;
      case '/':
        e.preventDefault();
        els.searchInput?.focus();
        break;
      case '?':
        e.preventDefault();
        showShortcutsModal();
        break;
      case 'Escape':
        closeCardModal();
        els.shortcutsModal.classList.add('hidden');
        break;
    }
  });
}

function setupSearch() {
  if (!els.searchInput) return;

  els.searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    els.clearSearch.classList.toggle('hidden', !searchQuery);
    refreshBoard();
  });

  els.clearSearch.addEventListener('click', () => {
    searchQuery = '';
    els.searchInput.value = '';
    els.clearSearch.classList.add('hidden');
    refreshBoard();
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
