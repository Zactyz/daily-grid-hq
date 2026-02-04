import { json, nowMs, requireEmail } from '../_util.js';

async function ensureCardsTable(env) {
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
}

// (intentionally removed auto friday_status updates here)

const VALID = new Set(['backlog','doing','blocked','done']);
const VALID_PRIORITY = new Set(['low', 'medium', 'high', 'urgent']);

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

export async function onRequestPatch({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCardsTable(env);

  const id = params.id;
  const body = await request.json().catch(() => ({}));

  if (body.isEpic === true && body.epicId) {
    return json({ error: 'epic_cannot_have_epic' }, { status: 400 });
  }

  const updates = [];
  const binds = [];

  if (body.title != null) {
    const title = String(body.title).trim();
    if (!title) return json({ error: 'title_required' }, { status: 400 });
    updates.push('title = ?');
    binds.push(title);
  }

  if (body.status != null) {
    const status = String(body.status);
    if (!VALID.has(status)) return json({ error: 'invalid_status' }, { status: 400 });
    updates.push('status = ?');
    binds.push(status);
  }

  if (body.description != null) {
    const description = body.description ? String(body.description).trim() : null;
    updates.push('description = ?');
    binds.push(description);
  }

  if (body.labels != null) {
    let isEpicForLabels = body.isEpic;
    if (isEpicForLabels == null) {
      const row = await env.DB.prepare('SELECT is_epic FROM cards WHERE id = ? LIMIT 1;').bind(id).first();
      isEpicForLabels = Boolean(row?.is_epic);
    }
    const labelsArr = normalizeLabels(body.labels, { isEpic: isEpicForLabels });
    const labels = labelsArr.length ? JSON.stringify(labelsArr) : null;
    updates.push('labels = ?');
    binds.push(labels);
  }

  if (body.dueDate != null) {
    const dueDate = body.dueDate ? Math.floor(new Date(body.dueDate).getTime()) : null;
    updates.push('due_date = ?');
    binds.push(dueDate);
  }

  if (body.priority != null) {
    const priority = body.priority || null;
    if (priority && !VALID_PRIORITY.has(priority)) {
      return json({ error: 'invalid_priority' }, { status: 400 });
    }
    updates.push('priority = ?');
    binds.push(priority);
  }

  if (body.isEpic != null) {
    const isEpic = Boolean(body.isEpic);
    updates.push('is_epic = ?');
    binds.push(isEpic ? 1 : 0);

    if (isEpic) {
      // Epics cannot belong to another epic.
      updates.push('epic_id = ?');
      binds.push(null);

      // Ensure epic label is present when promoting to epic.
      if (body.labels == null) {
        const row = await env.DB.prepare('SELECT labels FROM cards WHERE id = ? LIMIT 1;').bind(id).first();
        const current = row?.labels ? JSON.parse(row.labels) : [];
        const labelsArr = normalizeLabels(current, { isEpic: true });
        updates.push('labels = ?');
        binds.push(labelsArr.length ? JSON.stringify(labelsArr) : null);
      }
    }
  }

  if (body.epicId !== undefined) {
    const epicId = body.epicId ? String(body.epicId) : null;
    if (epicId && epicId === id) return json({ error: 'invalid_epic' }, { status: 400 });
    if (epicId) {
      const current = await env.DB.prepare('SELECT is_epic FROM cards WHERE id = ? LIMIT 1;').bind(id).first();
      if (current?.is_epic) return json({ error: 'epic_cannot_have_epic' }, { status: 400 });
    }
    if (epicId) {
      const epic = await resolveEpic(env, epicId);
      if (!epic) return json({ error: 'invalid_epic' }, { status: 400 });
    }
    updates.push('epic_id = ?');
    binds.push(epicId);
  }

  if (body.archived != null) {
    const archived = body.archived ? 1 : 0;
    updates.push('archived = ?');
    binds.push(archived);
  }

  if (body.sort != null) {
    const sort = Number(body.sort);
    if (!isNaN(sort)) {
      updates.push('sort = ?');
      binds.push(sort);
    }
  }

  if (updates.length === 0) return json({ error: 'no_updates' }, { status: 400 });

  updates.push('updated_at = ?');
  binds.push(nowMs());

  binds.push(id);

  const sql = `UPDATE cards SET ${updates.join(', ')} WHERE id = ?;`;
  const res = await env.DB.prepare(sql).bind(...binds).run();

  if ((res.meta?.changes || 0) === 0) return json({ error: 'not_found' }, { status: 404 });

  // NOTE: Do not auto-update Friday Status from card status transitions.
  // Status should reflect the executor's actual runtime state.

  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCardsTable(env);

  const id = params.id;
  const res = await env.DB.prepare('DELETE FROM cards WHERE id = ?;').bind(id).run();
  if ((res.meta?.changes || 0) === 0) return json({ error: 'not_found' }, { status: 404 });
  return json({ ok: true });
}
