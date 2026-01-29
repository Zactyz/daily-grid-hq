export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

export function requireEmail(request, env) {
  // Cloudflare Access injects this header when protected by Access.
  // In local dev, allow by setting ALLOWED_EMAILS empty.
  const email = request.headers.get('Cf-Access-Authenticated-User-Email') || '';

  const allowList = (env.ALLOWED_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (allowList.length === 0) {
    // dev / unconfigured
    return { ok: true, email: email || null };
  }

  if (!email) return { ok: false, reason: 'missing_email' };
  if (!allowList.includes(email)) return { ok: false, reason: 'not_allowed' };
  return { ok: true, email };
}

export function nowMs() {
  return Date.now();
}
