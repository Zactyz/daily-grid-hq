import { json, nowMs, requireEmail } from '../../_util.js';

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

export async function onRequestPost({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCardsTable(env);

  const id = params.id;
  const now = nowMs();

  const res = await env.DB.prepare(
    'UPDATE cards SET archived = 1, updated_at = ? WHERE id = ?;'
  ).bind(now, id).run();

  if ((res.meta?.changes || 0) === 0) return json({ error: 'not_found' }, { status: 404 });
  return json({ ok: true });
}
