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
  // Check for Bearer token first (for MCP/API access)
  const authHeader = request.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
  if (bearerMatch) {
    const token = bearerMatch[1];
    // Token auth for automation.
    // Prefer dedicated API_TOKEN / KANBAN_API_TOKEN.
    // For dev/testing, allow FRIDAY_STATUS_WRITE_TOKEN to double as the API token.
    const validToken = env.API_TOKEN || env.KANBAN_API_TOKEN || env.FRIDAY_STATUS_WRITE_TOKEN;
    if (validToken && token === validToken) {
      return { ok: true, email: null, authMethod: 'token' };
    }
    // If API_TOKEN is not set, allow token auth in dev mode
    if (!validToken && !env.ALLOWED_EMAILS) {
      return { ok: true, email: null, authMethod: 'token' };
    }
  }

  // Cloudflare Access injects this header when protected by Access.
  // In local dev, allow by setting ALLOWED_EMAILS empty.
  const email = request.headers.get('Cf-Access-Authenticated-User-Email') || '';

  const allowList = (env.ALLOWED_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (allowList.length === 0) {
    // dev / unconfigured
    return { ok: true, email: email || null, authMethod: 'access' };
  }

  if (!email) return { ok: false, reason: 'missing_email' };
  if (!allowList.includes(email)) return { ok: false, reason: 'not_allowed' };
  return { ok: true, email, authMethod: 'access' };
}

export function nowMs() {
  return Date.now();
}
