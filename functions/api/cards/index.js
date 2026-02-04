import { json, nowMs, requireEmail } from '../_util.js';

async function ensureCardsTable(env) {
  // Safe no-op if already exists
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('backlog','doing','blocked','done')),
      sort INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      description TEXT,
      labels TEXT,
      due_date INTEGER,
      archived INTEGER DEFAULT 0,
      priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      is_epic INTEGER DEFAULT 0,
      epic_id TEXT
    );`
  ).run();

  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_status_sort ON cards(status, sort);').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_archived ON cards(archived);').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_due_date ON cards(due_date);').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_epic_id ON cards(epic_id);').run();
}

async function resolveEpic(env, epicId) {
  if (!epicId) return null;
  const row = await env.DB.prepare(
    'SELECT id, is_epic, archived FROM cards WHERE id = ? LIMIT 1;'
  ).bind(epicId).first();
  if (!row || !row.id || !row.is_epic || row.archived) return null;
  return row;
}

function normalizeLabels(rawLabels, { isEpic } = {}) {
  const labels = Array.isArray(rawLabels) ? rawLabels.map(String).map(s => s.trim()).filter(Boolean) : [];
  if (isEpic && !labels.some(l => l.toLowerCase() === 'epic')) {
    labels.push('epic');
  }
  return labels;
}

export async function onRequestGet({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCardsTable(env);

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('archived') === 'true';
  const epicOnly = url.searchParams.get('epic') === 'true';
  const epicId = url.searchParams.get('epicId');

  let query = 'SELECT id, title, status, sort, created_at, updated_at, description, labels, due_date, archived, priority, is_epic, epic_id FROM cards';
  const conditions = [];
  if (!includeArchived) {
    conditions.push('(archived IS NULL OR archived = 0)');
  }
  if (epicOnly) {
    conditions.push('is_epic = 1');
  }
  if (epicId) {
    conditions.push('epic_id = ?');
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY status ASC, sort ASC, updated_at DESC';

  const stmt = env.DB.prepare(query);
  const rows = epicId ? await stmt.bind(epicId).all() : await stmt.all();

  return json({
    ok: true,
    cards: (rows.results || []).map(r => ({
      id: r.id,
      title: r.title,
      status: r.status,
      sort: r.sort,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      description: r.description || null,
      labels: r.labels ? JSON.parse(r.labels) : [],
      dueDate: r.due_date || null,
      archived: Boolean(r.archived),
      priority: r.priority || null,
      isEpic: Boolean(r.is_epic),
      epicId: r.epic_id || null
    }))
  });
}

export async function onRequestPost({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCardsTable(env);

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'title_required' }, { status: 400 });

  const id = crypto.randomUUID();
  const now = nowMs();
  const status = body.status || 'backlog';
  const description = body.description ? String(body.description).trim() : null;
  const isEpic = Boolean(body.isEpic);
  const epicId = body.epicId ? String(body.epicId) : null;
  if (isEpic && epicId) return json({ error: 'epic_cannot_have_epic' }, { status: 400 });
  if (epicId) {
    const epic = await resolveEpic(env, epicId);
    if (!epic) return json({ error: 'invalid_epic' }, { status: 400 });
  }

  const labelsArr = normalizeLabels(body.labels, { isEpic });
  const labels = labelsArr.length ? JSON.stringify(labelsArr) : null;
  const dueDate = body.dueDate ? Math.floor(new Date(body.dueDate).getTime()) : null;
  const priority = body.priority || null;

  // Validate status
  const VALID_STATUS = new Set(['backlog','doing','blocked','done']);
  if (!VALID_STATUS.has(status)) {
    return json({ error: 'invalid_status' }, { status: 400 });
  }

  // Validate priority
  if (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
    return json({ error: 'invalid_priority' }, { status: 400 });
  }

  // find next sort in target status
  const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) as m FROM cards WHERE status = ? AND (archived IS NULL OR archived = 0);').bind(status).first();
  const sort = Number(maxRow?.m || 0) + 1;

  await env.DB.prepare(
    'INSERT INTO cards (id, title, status, sort, created_at, updated_at, description, labels, due_date, archived, priority, is_epic, epic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?);'
  ).bind(id, title, status, sort, now, now, description, labels, dueDate, priority, isEpic ? 1 : 0, epicId).run();

  // NOTE: We intentionally do NOT auto-update Friday Status here.
  // Status should reflect the real agent executor, not just card creation.

  return json({ ok: true, id });
}
