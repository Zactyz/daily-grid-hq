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
      priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
    );`
  ).run();
}

async function ensureFridayStatusTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS friday_status (
      id TEXT PRIMARY KEY,
      message TEXT,
      mode TEXT,
      focus_card_id TEXT,
      updated_at INTEGER
    );`
  ).run();
}

const VALID = new Set(['backlog','doing','blocked','done']);

export async function onRequestPatch({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCardsTable(env);

  const id = params.id;
  const body = await request.json().catch(() => ({}));

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
    const labels = body.labels ? JSON.stringify(Array.isArray(body.labels) ? body.labels : []) : null;
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
    if (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
      return json({ error: 'invalid_priority' }, { status: 400 });
    }
    updates.push('priority = ?');
    binds.push(priority);
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

  // If a task is moved into "doing", update Friday's focus automatically.
  if (body.status != null) {
    const status = String(body.status);
    if (status === 'doing') {
      await ensureFridayStatusTable(env);
      const row = await env.DB.prepare('SELECT title FROM cards WHERE id = ?;').bind(id).first();
      const title = row?.title ? String(row.title) : id;
      const now = nowMs();
      await env.DB.prepare(
        'INSERT INTO friday_status (id, message, mode, focus_card_id, updated_at) VALUES (?, ?, ?, ?, ?)\n' +
        'ON CONFLICT(id) DO UPDATE SET message=excluded.message, mode=excluded.mode, focus_card_id=excluded.focus_card_id, updated_at=excluded.updated_at;'
      ).bind('singleton', `Working on: ${title}`, 'working', id, now).run();
    }

    // If a focused task is marked done, clear focus.
    if (status === 'done') {
      await ensureFridayStatusTable(env);
      const cur = await env.DB.prepare('SELECT focus_card_id FROM friday_status WHERE id = ?;').bind('singleton').first();
      if (cur?.focus_card_id === id) {
        const now = nowMs();
        await env.DB.prepare(
          'INSERT INTO friday_status (id, message, mode, focus_card_id, updated_at) VALUES (?, ?, ?, ?, ?)\n' +
          'ON CONFLICT(id) DO UPDATE SET message=excluded.message, mode=excluded.mode, focus_card_id=excluded.focus_card_id, updated_at=excluded.updated_at;'
        ).bind('singleton', '', 'idle', null, now).run();
      }
    }
  }

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
