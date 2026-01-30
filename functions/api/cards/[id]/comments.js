import { json, nowMs, requireEmail } from '../../_util.js';

async function ensureCommentsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS card_comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      parent_id TEXT,
      author_email TEXT,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_card_comments_card_id_created_at ON card_comments(card_id, created_at);'
  ).run();
}

export async function onRequestGet({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCommentsTable(env);

  const cardId = params.id;
  const rows = await env.DB.prepare(
    'SELECT id, card_id, parent_id, author_email, text, created_at FROM card_comments WHERE card_id = ? ORDER BY created_at ASC;'
  ).bind(cardId).all();

  return json({
    ok: true,
    comments: (rows.results || []).map(r => ({
      id: r.id,
      cardId: r.card_id,
      parentId: r.parent_id || null,
      author: r.author_email || null,
      text: r.text,
      createdAt: r.created_at
    }))
  });
}

export async function onRequestPost({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureCommentsTable(env);

  const cardId = params.id;
  const body = await request.json().catch(() => ({}));

  const text = String(body.text || '').trim();
  if (!text) return json({ error: 'text_required' }, { status: 400 });

  const parentId = body.parentId ? String(body.parentId) : null;

  const id = crypto.randomUUID();
  const createdAt = nowMs();

  await env.DB.prepare(
    'INSERT INTO card_comments (id, card_id, parent_id, author_email, text, created_at) VALUES (?, ?, ?, ?, ?, ?);'
  ).bind(id, cardId, parentId, auth.email, text, createdAt).run();

  return json({ ok: true, id, createdAt });
}
