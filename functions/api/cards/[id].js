import { json, nowMs, requireEmail } from '../_util.js';

const VALID = new Set(['backlog','doing','blocked','done']);

export async function onRequestPatch({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

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

  if (updates.length === 0) return json({ error: 'no_updates' }, { status: 400 });

  updates.push('updated_at = ?');
  binds.push(nowMs());

  binds.push(id);

  const sql = `UPDATE cards SET ${updates.join(', ')} WHERE id = ?;`;
  const res = await env.DB.prepare(sql).bind(...binds).run();

  if ((res.meta?.changes || 0) === 0) return json({ error: 'not_found' }, { status: 404 });
  return json({ ok: true });
}

export async function onRequestDelete({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  const id = params.id;
  const res = await env.DB.prepare('DELETE FROM cards WHERE id = ?;').bind(id).run();
  if ((res.meta?.changes || 0) === 0) return json({ error: 'not_found' }, { status: 404 });
  return json({ ok: true });
}
