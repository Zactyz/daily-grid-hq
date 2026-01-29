import { json, nowMs, requireEmail } from '../_util.js';

export async function onRequestGet({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('archived') === 'true';

  let query = 'SELECT id, title, status, sort, created_at, updated_at, description, labels, due_date, archived, priority FROM cards';
  const conditions = [];
  if (!includeArchived) {
    conditions.push('(archived IS NULL OR archived = 0)');
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY status ASC, sort ASC, updated_at DESC';

  const rows = await env.DB.prepare(query).all();

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
      priority: r.priority || null
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
  const status = body.status || 'backlog';
  const description = body.description ? String(body.description).trim() : null;
  const labels = body.labels ? JSON.stringify(Array.isArray(body.labels) ? body.labels : []) : null;
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
    'INSERT INTO cards (id, title, status, sort, created_at, updated_at, description, labels, due_date, archived, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?);'
  ).bind(id, title, status, sort, now, now, description, labels, dueDate, priority).run();

  return json({ ok: true, id });
}
