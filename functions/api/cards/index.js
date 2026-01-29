import { json, nowMs, requireEmail } from '../_util.js';

export async function onRequestGet({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  const rows = await env.DB.prepare(
    'SELECT id, title, status, sort, created_at, updated_at FROM cards ORDER BY status ASC, sort ASC, updated_at DESC'
  ).all();

  return json({
    ok: true,
    cards: (rows.results || []).map(r => ({
      id: r.id,
      title: r.title,
      status: r.status,
      sort: r.sort,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  });
}

export async function onRequestPost({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'title_required' }, { status: 400 });

  const id = crypto.randomUUID();
  const now = nowMs();

  // find next sort in backlog
  const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) as m FROM cards WHERE status = ?;').bind('backlog').first();
  const sort = Number(maxRow?.m || 0) + 1;

  await env.DB.prepare(
    'INSERT INTO cards (id, title, status, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);'
  ).bind(id, title, 'backlog', sort, now, now).run();

  return json({ ok: true, id });
}
