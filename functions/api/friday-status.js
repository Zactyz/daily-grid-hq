import { json, nowMs, requireEmail } from './_util.js';

const DEFAULT = {
  message: '',
  mode: 'idle',
  focusCardId: null,
  updatedAt: null
};

async function ensureTable(env) {
  // Safe no-op if already exists
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

async function getRow(env) {
  await ensureTable(env);
  const row = await env.DB.prepare('SELECT id, message, mode, focus_card_id, updated_at FROM friday_status WHERE id = ?;').bind('singleton').first();
  if (!row) return { ...DEFAULT };
  return {
    message: row.message || '',
    mode: row.mode || 'idle',
    focusCardId: row.focus_card_id || null,
    updatedAt: row.updated_at || null
  };
}

export async function onRequestGet({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  const status = await getRow(env);
  return json({ ok: true, status });
}

function requireWriteToken(request, env) {
  const expected = env.FRIDAY_STATUS_WRITE_TOKEN;
  if (!expected) return { ok: true, mode: 'disabled' };

  const h = request.headers.get('authorization') || '';
  const token = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null;
  if (!token) return { ok: false, reason: 'missing_bearer_token' };
  if (token !== expected) return { ok: false, reason: 'invalid_token' };
  return { ok: true, mode: 'token' };
}

export async function onRequestPut({ request, env }) {
  // Writes are intended for automation.
  // If FRIDAY_STATUS_WRITE_TOKEN is set, allow Bearer-token writes *without* Cloudflare Access.
  // If FRIDAY_STATUS_WRITE_TOKEN is not set, fall back to Access (email header).
  const writeAuth = requireWriteToken(request, env);

  if (writeAuth.mode === 'token') {
    // ok
  } else {
    const auth = requireEmail(request, env);
    if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

    if (!writeAuth.ok) return json({ error: 'forbidden', reason: writeAuth.reason }, { status: 403 });
  }

  await ensureTable(env);

  const body = await request.json().catch(() => ({}));

  const message = body.message == null ? undefined : String(body.message);
  const mode = body.mode == null ? undefined : String(body.mode);
  const focusCardId = body.focusCardId === undefined ? undefined : (body.focusCardId === null ? null : String(body.focusCardId));

  const prev = await getRow(env);

  const next = {
    message: message !== undefined ? message : prev.message,
    mode: mode !== undefined ? mode : prev.mode,
    focusCardId: focusCardId !== undefined ? focusCardId : prev.focusCardId,
    updatedAt: nowMs()
  };

  await env.DB.prepare(
    'INSERT INTO friday_status (id, message, mode, focus_card_id, updated_at) VALUES (?, ?, ?, ?, ?)\n     ON CONFLICT(id) DO UPDATE SET message=excluded.message, mode=excluded.mode, focus_card_id=excluded.focus_card_id, updated_at=excluded.updated_at;'
  ).bind('singleton', next.message, next.mode, next.focusCardId, next.updatedAt).run();

  return json({ ok: true, status: next });
}
