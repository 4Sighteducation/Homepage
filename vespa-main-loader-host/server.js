const path = require('path');
const express = require('express');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// CORS for loader.js:
// - Script tags don't need CORS, but a synchronous XHR bootstrap does.
// - We keep this permissive because the loader itself is not secret (it is public JS anyway).
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// CORS for API endpoints (restrict to Knack origin)
function setApiCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    'https://vespaacademy.knack.com',
    'https://www.vespaacademy.knack.com',
  ]);

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Knack-User-Token'
  );
}

// Health check (Heroku)
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'vespa-main loader-host',
    timestamp: new Date().toISOString(),
  });
});

// Preflight for API
app.options('/api/knack/*', (req, res) => {
  setApiCors(req, res);
  res.status(204).end();
});

// Preflight for SendGrid proxy
app.options('/api/send-email', (req, res) => {
  setApiCors(req, res);
  res.status(204).end();
});

/**
 * Minimal Knack proxy (temporary)
 * - Uses KNACK_APP_ID and KNACK_API_KEY from server env
 * - Requires a user token header from the browser (Authorization or X-Knack-User-Token)
 * - Strict allowlist of Knack paths (start small; expand as needed)
 *
 * Request body:
 * {
 *   "method": "GET" | "POST" | "PUT" | "DELETE",
 *   "path": "/v1/objects/object_6/records" | "/v1/objects/object_6/records/recordId",
 *   "query": { ... },   // optional, converted to query string
 *   "body": { ... }     // optional, for POST/PUT/DELETE
 * }
 */
app.post('/api/knack/proxy', async (req, res) => {
  try {
    setApiCors(req, res);

    const KNACK_APP_ID = process.env.KNACK_APP_ID;
    const KNACK_API_KEY = process.env.KNACK_API_KEY;
    if (!KNACK_APP_ID || !KNACK_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: 'Server not configured (missing KNACK_APP_ID/KNACK_API_KEY)',
      });
    }

    const method = String(req.body?.method || 'GET').toUpperCase();
    const allowedMethods = new Set(['GET', 'POST', 'PUT', 'DELETE']);
    if (!allowedMethods.has(method)) {
      return res.status(400).json({ ok: false, error: `Invalid method: ${method}` });
    }

    const pathIn = String(req.body?.path || '');
    if (!pathIn.startsWith('/v1/')) {
      return res.status(400).json({ ok: false, error: 'Invalid path (must start with /v1/)' });
    }
    if (pathIn.includes('..') || pathIn.includes('\\\\')) {
      return res.status(400).json({ ok: false, error: 'Invalid path' });
    }

    // Allowlist: only Knack object record endpoints (expand later as needed)
    const allowlisted = [
      /^\/v1\/objects\/object_\d+\/records$/,
      /^\/v1\/objects\/object_\d+\/records\/[A-Za-z0-9]+$/,
    ].some((re) => re.test(pathIn));

    if (!allowlisted) {
      return res.status(403).json({
        ok: false,
        error: 'Path not allowlisted for proxy',
        path: pathIn,
      });
    }

    const userToken =
      (typeof req.headers.authorization === 'string' && req.headers.authorization) ||
      (typeof req.headers['x-knack-user-token'] === 'string' && req.headers['x-knack-user-token']);

    if (!userToken) {
      return res.status(401).json({
        ok: false,
        error: 'Missing user token (Authorization or X-Knack-User-Token)',
      });
    }

    const qs = new URLSearchParams();
    const query = req.body?.query && typeof req.body.query === 'object' ? req.body.query : null;
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        qs.set(String(k), String(v));
      }
    }

    const url =
      'https://api.knack.com' +
      pathIn +
      (qs.toString() ? `?${qs.toString()}` : '');

    const headers = {
      'X-Knack-Application-Id': KNACK_APP_ID,
      'X-Knack-REST-API-Key': KNACK_API_KEY,
      'Content-Type': 'application/json',
      Authorization: userToken,
    };

    const body =
      method === 'GET' ? undefined : req.body?.body !== undefined ? JSON.stringify(req.body.body) : undefined;

    const resp = await fetch(url, { method, headers, body });
    const contentType = resp.headers.get('content-type') || 'application/json';
    const text = await resp.text();

    res.status(resp.status);
    res.setHeader('Content-Type', contentType);
    return res.send(text);
  } catch (e) {
    // Don't leak internals to the browser; log minimal server-side
    // eslint-disable-next-line no-console
    console.error('[vespa-main-loader-host] /api/knack/proxy error', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Proxy error' });
  }
});

/**
 * Minimal SendGrid proxy (temporary)
 * - Uses SENDGRID_API_KEY from server env
 * - Requires a user token header from the browser (Authorization or X-Knack-User-Token)
 * - Restricts CORS to Knack origin via setApiCors
 *
 * Accepts a standard SendGrid v3 /mail/send payload (JSON) and forwards it.
 */
app.post('/api/send-email', async (req, res) => {
  try {
    setApiCors(req, res);

    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    if (!SENDGRID_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Server not configured (missing SENDGRID_API_KEY)' });
    }

    const userToken =
      (typeof req.headers.authorization === 'string' && req.headers.authorization) ||
      (typeof req.headers['x-knack-user-token'] === 'string' && req.headers['x-knack-user-token']);
    if (!userToken) {
      return res.status(401).json({ ok: false, error: 'Missing user token (Authorization or X-Knack-User-Token)' });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }

    // Basic safety rails: ensure "from" is present and sane.
    const fromEmail = payload?.from?.email;
    const allowedFrom = new Set(['noreply@vespa.academy', 'noreply@notifications.vespa.academy']);
    if (!fromEmail || typeof fromEmail !== 'string' || !allowedFrom.has(fromEmail.toLowerCase())) {
      return res.status(400).json({ ok: false, error: 'Invalid from.email' });
    }

    // Limit number of recipients per request (prevents bulk abuse)
    const personalizations = Array.isArray(payload.personalizations) ? payload.personalizations : [];
    const toCount = personalizations.reduce((acc, p) => acc + (Array.isArray(p.to) ? p.to.length : 0), 0);
    if (toCount <= 0 || toCount > 10) {
      return res.status(400).json({ ok: false, error: 'Invalid recipient count' });
    }

    const sgResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await sgResp.text();
    if (!sgResp.ok) {
      return res.status(sgResp.status).json({ ok: false, error: 'SendGrid error', details: text.slice(0, 2000) });
    }

    // SendGrid often returns 202 + empty body on success.
    return res.status(200).json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[vespa-main-loader-host] /api/send-email error', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Email proxy error' });
  }
});

// Serve the loader with predictable caching (cache-bust via query param)
app.get(['/loader.js', '/public/loader.js'], (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  setCors(res);
  // IMPORTANT:
  // This loader is the control plane for all other JS assets.
  // Serve it with no-store so a fresh deployment is picked up immediately
  // without having to update Knack custom code or rely on a query param.
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'loader.js'));
});

// Preflight for XHR bootstraps
app.options(['/loader.js', '/public/loader.js'], (_req, res) => {
  setCors(res);
  res.status(204).end();
});

// Static asset fallback
app.use('/public', express.static(path.join(__dirname, 'public'), { etag: true, maxAge: '5m' }));

app.get('/', (_req, res) => {
  res
    .status(200)
    .type('text/plain')
    .send(
      [
        'VESPA Knack Loader Host',
        '',
        'GET /loader.js',
        'GET /health',
        '',
      ].join('\n')
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[vespa-main-loader-host] listening on :${PORT}`);
});

