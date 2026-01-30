import { json, requireEmail } from '../_util.js';

async function ensureAttachmentsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS card_attachments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      author_email TEXT,
      created_at INTEGER NOT NULL
    );`
  ).run();
}

export async function onRequestGet({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  if (!env.ATTACHMENTS) {
    return json({ error: 'attachments_not_configured' }, { status: 501 });
  }

  await ensureAttachmentsTable(env);

  const id = params.id;
  const row = await env.DB.prepare(
    'SELECT id, r2_key, mime_type FROM card_attachments WHERE id = ?;'
  ).bind(id).first();

  if (!row) return json({ error: 'not_found' }, { status: 404 });

  const obj = await env.ATTACHMENTS.get(row.r2_key);
  if (!obj) return json({ error: 'missing_object' }, { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', row.mime_type || 'application/octet-stream');
  // Keep cache conservative; Access + auth means we don't want CDN caching surprises.
  headers.set('Cache-Control', 'private, max-age=60');

  return new Response(obj.body, { status: 200, headers });
}
