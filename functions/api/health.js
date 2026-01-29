import { json, nowMs, requireEmail } from './_util.js';

export async function onRequest({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });

  // Tiny DB ping
  let dbOk = true;
  let dbTimeMs = null;
  try {
    const t0 = Date.now();
    await env.DB.prepare('SELECT 1;').first();
    dbTimeMs = Date.now() - t0;
  } catch {
    dbOk = false;
  }

  return json({
    ok: true,
    now: nowMs(),
    db: { ok: dbOk, timeMs: dbTimeMs },
    version: env.VERSION || 'dev'
  });
}
