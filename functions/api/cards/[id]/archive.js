import { json, nowMs, requireEmail } from '../../_util.js';

export async function onRequestPost({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  const id = params.id;
  const now = nowMs();

  const res = await env.DB.prepare(
    'UPDATE cards SET archived = 1, updated_at = ? WHERE id = ?;'
  ).bind(now, id).run();

  if ((res.meta?.changes || 0) === 0) return json({ error: 'not_found' }, { status: 404 });
  return json({ ok: true });
}
