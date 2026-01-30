import { json, nowMs, requireEmail } from '../../_util.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function extForMime(m) {
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  return 'bin';
}

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

  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id_created_at ON card_attachments(card_id, created_at);'
  ).run();
}

export async function onRequestGet({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  await ensureAttachmentsTable(env);

  const cardId = params.id;
  const rows = await env.DB.prepare(
    'SELECT id, card_id, kind, mime_type, size_bytes, author_email, created_at FROM card_attachments WHERE card_id = ? ORDER BY created_at ASC;'
  ).bind(cardId).all();

  return json({
    ok: true,
    attachments: (rows.results || []).map(r => ({
      id: r.id,
      cardId: r.card_id,
      kind: r.kind,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      author: r.author_email || null,
      createdAt: r.created_at,
      url: `/api/attachments/${r.id}`
    }))
  });
}

export async function onRequestPost({ request, env, params }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  if (!env.ATTACHMENTS) {
    return json({ error: 'attachments_not_configured', hint: 'Bind an R2 bucket as ATTACHMENTS' }, { status: 501 });
  }

  await ensureAttachmentsTable(env);

  const maxBytes = Number(env.MAX_ATTACHMENT_BYTES || DEFAULT_MAX_BYTES);
  const cardId = params.id;

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: 'invalid_form_data' }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'file_required', field: 'file' }, { status: 400 });

  const mime = file.type || '';
  if (!ALLOWED.has(mime)) {
    return json({ error: 'invalid_mime_type', allowed: Array.from(ALLOWED) }, { status: 400 });
  }

  const size = Number(file.size || 0);
  if (!size || size <= 0) return json({ error: 'empty_file' }, { status: 400 });
  if (size > maxBytes) return json({ error: 'file_too_large', maxBytes }, { status: 413 });

  const id = crypto.randomUUID();
  const createdAt = nowMs();
  const key = `cards/${cardId}/${id}.${extForMime(mime)}`;

  // Put into R2 (private). Serve via our own authenticated endpoint.
  await env.ATTACHMENTS.put(key, file.stream(), {
    httpMetadata: { contentType: mime },
    customMetadata: {
      cardId,
      attachmentId: id,
      authorEmail: auth.email || ''
    }
  });

  await env.DB.prepare(
    'INSERT INTO card_attachments (id, card_id, kind, r2_key, mime_type, size_bytes, author_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);'
  ).bind(id, cardId, 'image', key, mime, size, auth.email, createdAt).run();

  return json({
    ok: true,
    attachment: {
      id,
      cardId,
      kind: 'image',
      mimeType: mime,
      sizeBytes: size,
      author: auth.email || null,
      createdAt,
      url: `/api/attachments/${id}`
    }
  });
}
