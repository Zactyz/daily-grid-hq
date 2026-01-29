import { json, requireEmail } from './_util.js';

export async function onRequest({ request, env }) {
  const auth = requireEmail(request, env);
  if (!auth.ok) return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });
  return json({ ok: true, email: auth.email });
}
