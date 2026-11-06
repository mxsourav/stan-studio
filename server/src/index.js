import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { supabase, ADMIN_SECRET_KEY, PORT, ALLOWED_ORIGIN } from './supabase.js';
import { syncInbox, sendMail, mailConfigured } from './mail.js';

const app = express();

// ─── Security headers & defensive middleware ───────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(express.json({ limit: '4mb' })); // recipes + SVG strings + webp preview
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGIN.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
  }),
);

// ─── Rate Limiters ─────────────────────────────────────────────────────────
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please wait a few minutes before trying again.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests to admin endpoints.' },
});

const emailSyncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Inbox sync throttled. Please wait a moment before syncing again.' },
});

const emailSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Email send rate limit reached for this hour.' },
});

const STATUSES = ['pending', 'confirmed', 'printing', 'shipped', 'cancelled'];

// ─── health (Render/Railway keep-alive pings) ────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── order id: STAN-YYMMDD-XXXX ──────────────────────────────────────────────
function generateOrderId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `STAN-${yy}${mm}${dd}-${rand}`;
}

// Constant-time admin passkey verification
function requireAdmin(req, res) {
  if (!ADMIN_SECRET_KEY) {
    res.status(503).json({ ok: false, error: 'Admin access is not configured on this server.' });
    return false;
  }
  const key = req.get('x-admin-key');
  if (!key || typeof key !== 'string') {
    res.status(401).json({ ok: false, error: 'Unauthorized — missing admin key' });
    return false;
  }
  const keyBuf = Buffer.from(key);
  const secretBuf = Buffer.from(ADMIN_SECRET_KEY);
  if (keyBuf.length !== secretBuf.length || !crypto.timingSafeEqual(keyBuf, secretBuf)) {
    res.status(401).json({ ok: false, error: 'Unauthorized — invalid admin key' });
    return false;
  }
  return true;
}

// ─── submit an order ─────────────────────────────────────────────────────────
app.post('/api/orders', orderLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.customer_name || String(b.customer_name).trim().length < 2) errors.push('customer_name is required');
    if (!b.customer_phone || !/^[+\d][\d\s-]{7,15}$/.test(String(b.customer_phone))) errors.push('customer_phone is required');
    if (!b.recipe_json || typeof b.recipe_json !== 'object') errors.push('recipe_json is required');
    if (!b.design_svg || String(b.design_svg).length < 40) errors.push('design_svg is required');
    if (!b.bom_json || typeof b.bom_json !== 'object') errors.push('bom_json is required');
    if (errors.length) return res.status(400).json({ ok: false, error: errors.join('; ') });

    const orderId = generateOrderId();
    const row = {
      order_id: orderId,
      customer_name: String(b.customer_name).trim().slice(0, 120),
      customer_phone: String(b.customer_phone).trim().slice(0, 20),
      customer_address: b.customer_address ? String(b.customer_address).trim().slice(0, 400) : null,
      customer_notes: b.customer_notes ? String(b.customer_notes).trim().slice(0, 1000) : null,
      status: 'pending',
      recipe_json: b.recipe_json,
      design_svg: String(b.design_svg).slice(0, 2_000_000),
      design_name: b.design_name ? String(b.design_name).slice(0, 160) : null,
      plate_svg: b.plate_svg ? String(b.plate_svg).slice(0, 2_000_000) : null,
      preview_data_url: b.preview_data_url ? String(b.preview_data_url).slice(0, 1_000_000) : null,
      bom_json: b.bom_json,
      total_inr: Number(b.total_inr) || 0,
    };

    const { data, error } = await supabase.from('orders').insert(row).select().single();
    if (error) {
      console.error('[orders] insert failed:', error.message);
      return res.status(500).json({ ok: false, error: 'Failed to save the order' });
    }

    const phone = String(b.customer_phone).replace(/[^\d]/g, '');
    const whatsappUrl = `https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(
      `Order ID: #${orderId}\nName: ${row.customer_name}\nPhone: ${row.customer_phone}\n` +
        `Shape: ${b.recipe_json.shape} | Box: ${b.bom_json.box_outer_size || ''} | Shadow: ${b.bom_json.shadow_size || ''}\n` +
        `Material: ${b.bom_json.material || 'PLA'} | Weight: ${b.bom_json.weight_g || ''} g | Total: ₹${row.total_inr}\n` +
        `My 3D design & recipe are saved under Order #${orderId}.`,
    )}`;

    res.status(201).json({ ok: true, orderId, order: data, whatsappUrl });
  } catch (e) {
    console.error('[orders] unexpected:', e);
    res.status(500).json({ ok: false, error: 'Unexpected server error' });
  }
});

// ─── admin: auth verification ───────────────────────────────────────────────
app.get('/api/admin/verify', adminLimiter, (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true });
});

// ─── admin: list orders ──────────────────────────────────────────────────────
app.get('/api/admin/orders', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, orders: data });
});

// ─── admin: update status / notes ────────────────────────────────────────────
app.patch('/api/admin/orders/:orderId', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { orderId } = req.params;
  const patch = {};
  if (req.body.status) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ ok: false, error: 'Invalid status' });
    patch.status = req.body.status;
  }
  if (req.body.admin_notes !== undefined) patch.customer_notes = String(req.body.admin_notes).slice(0, 1000);
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'Nothing to update' });

  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('order_id', orderId)
    .select()
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, order: data });
});

// ═══════════════════════════════════════════════════════════════════════════
// Custom STL Hub — zero-login tickets (STAN-STL-XXXX / STAN-SRC-XXXX)
// ═══════════════════════════════════════════════════════════════════════════

const HUB_KINDS = ['commission', 'sourcing'];

app.post('/api/hub-requests', orderLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.ticket_id || !/^STAN-(STL|SRC)-\d{4}$/.test(String(b.ticket_id))) errors.push('ticket_id is required (STAN-STL-XXXX / STAN-SRC-XXXX)');
    if (!HUB_KINDS.includes(b.kind)) errors.push('kind must be commission or sourcing');
    if (!b.item_name || !String(b.item_name).trim()) errors.push('item_name is required');
    if (errors.length) return res.status(400).json({ ok: false, error: errors.join('; ') });

    const row = {
      ticket_id: String(b.ticket_id).slice(0, 40),
      kind: b.kind,
      item_name: String(b.item_name).trim().slice(0, 200),
      file_name: b.file_name ? String(b.file_name).slice(0, 200) : null,
      specs: b.specs && typeof b.specs === 'object' ? b.specs : null,
      params: b.params && typeof b.params === 'object' ? b.params : null,
      estimate: b.estimate && typeof b.estimate === 'object' ? b.estimate : null,
      note: b.note ? String(b.note).slice(0, 2000) : null,
      storage_path: b.storage_path ? String(b.storage_path).slice(0, 300) : null,
      status: 'new',
    };

    const { data, error } = await supabase.from('hub_requests').insert(row).select().single();
    if (error) {
      console.error('[hub-requests] insert failed:', error.message);
      return res.status(500).json({ ok: false, error: 'Failed to save the hub request' });
    }
    res.status(201).json({ ok: true, ticket: data.ticket_id });
  } catch (e) {
    console.error('[hub-requests] unexpected:', e);
    res.status(500).json({ ok: false, error: 'Unexpected server error' });
  }
});

// 3D Forge — Groq CORS proxy. api.groq.com blocks browser-origin requests,
// so the Forge's BYOK key travels in the request body and this route plays
// relay (server-to-server, no CORS). Nothing is stored or logged here.
// Optional body.path forwards to another Groq path (e.g. "models").
app.post('/api/forge/groq', orderLimiter, async (req, res) => {
  try {
    const { apiKey, path, ...payload } = req.body || {};
    if (!apiKey || !/^gsk_/.test(String(apiKey))) {
      return res.status(400).json({ ok: false, error: 'missing Groq apiKey (gsk_…)' });
    }
    const safePath = ['chat/completions', 'models'].includes(String(path)) ? String(path) : 'chat/completions';
    const upstream = await fetch(`https://api.groq.com/openai/v1/${safePath}`, {
      method: safePath === 'models' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${String(apiKey).slice(0, 200)}` },
      body: safePath === 'models' ? undefined : JSON.stringify(payload),
    });
    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    console.error('[forge-groq] relay failed:', e);
    res.status(502).json({ ok: false, error: 'Groq relay failed' });
  }
});

// 3D Forge — NVIDIA NIM relay (quota backup): ZeroGPU quota dies → the chain
// falls back to NIM's hosted TRELLIS (separate NVIDIA credit pool). Binary
// passthrough — the GLB response must survive as raw bytes, not text.
app.post('/api/forge/nim', orderLimiter, async (req, res) => {
  try {
    const { apiKey, path } = req.body || {};
    if (!apiKey || !/^nvapi-/.test(String(apiKey))) {
      return res.status(400).json({ ok: false, error: 'missing NVIDIA apiKey (nvapi-…)' });
    }
    const invokePath = String(path || 'genai/microsoft/trellis').replace(/[^a-z0-9/._-]/gi, '');
    const { apiKey: _k, path: _p, ...payload } = req.body || {};
    const upstream = await fetch(`https://ai.api.nvidia.com/v1/${invokePath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${String(apiKey).slice(0, 250)}`,
      },
      body: JSON.stringify(payload),
    });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!upstream.ok || contentType.includes('application/json')) {
      const text = await upstream.text();
      return res.status(upstream.status).type(contentType).send(text);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).type(contentType).send(buf);
  } catch (e) {
    console.error('[forge-nim] relay failed:', e);
    res.status(502).json({ ok: false, error: 'NVIDIA relay failed' });
  }
});

// Tripo V3 relay — accepts the operator's OWN images (unlike NVIDIA's trial
// tier). One endpoint, four actions; the key rides in the body (BYOK) and is
// never stored server-side.
app.post('/api/forge/tripo', orderLimiter, async (req, res) => {
  try {
    const { apiKey, action } = req.body || {};
    if (!apiKey || !/^tsk_/.test(String(apiKey))) {
      return res.status(400).json({ ok: false, error: 'missing Tripo apiKey (tsk_…)' });
    }
    const auth = { Authorization: `Bearer ${String(apiKey).slice(0, 250)}` };
    const base = 'https://openapi.tripo3d.ai/v3';
    if (action === 'upload') {
      const { imageBase64, mime } = req.body;
      if (!imageBase64) return res.status(400).json({ ok: false, error: 'missing imageBase64' });
      const bin = Buffer.from(String(imageBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
      const form = new FormData();
      form.append('file', new Blob([bin], { type: mime || 'image/png' }), 'forge-image.png');
      const upstream = await fetch(`${base}/files`, { method: 'POST', headers: auth, body: form });
      const text = await upstream.text();
      return res.status(upstream.status).type('application/json').send(text);
    }
    if (action === 'create') {
      const { model, input } = req.body;
      const upstream = await fetch(`${base}/generation/image-to-model`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input }),
      });
      const text = await upstream.text();
      return res.status(upstream.status).type('application/json').send(text);
    }
    if (action === 'poll') {
      const { taskId } = req.body;
      if (!taskId || !/^[a-zA-Z0-9-]{6,80}$/.test(String(taskId))) {
        return res.status(400).json({ ok: false, error: 'bad taskId' });
      }
      const upstream = await fetch(`${base}/tasks/${encodeURIComponent(String(taskId))}`, { headers: auth });
      const text = await upstream.text();
      return res.status(upstream.status).type('application/json').send(text);
    }
    if (action === 'download') {
      const { url } = req.body;
      if (!url || !/^https:\/\/(cdn|openapi)\.tripo3d\.ai\//.test(String(url))) {
        return res.status(400).json({ ok: false, error: 'non-Tripo url rejected' });
      }
      const upstream = await fetch(String(url), { headers: auth });
      const contentType = upstream.headers.get('content-type') || 'model/gltf-binary';
      if (!upstream.ok) {
        const text = await upstream.text();
        return res.status(upstream.status).type('application/json').send(text);
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.status(upstream.status).type(contentType).send(buf);
    }
    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('[forge-tripo] relay failed:', e);
    res.status(502).json({ ok: false, error: 'Tripo relay failed' });
  }
});

app.get('/api/admin/hub-requests', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { data, error } = await supabase
    .from('hub_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, requests: data });
});

app.get('/api/admin/hub-requests/:ticketId/file', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { data: row, error } = await supabase
    .from('hub_requests')
    .select('storage_path')
    .eq('ticket_id', req.params.ticketId)
    .maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!row?.storage_path) return res.status(404).json({ ok: false, error: 'No stored file for this ticket' });
  const { data, error: urlError } = await supabase.storage.from('stl-files').createSignedUrl(row.storage_path, 600);
  if (urlError || !data) return res.status(500).json({ ok: false, error: 'Signed URL failed' });
  res.json({ ok: true, url: data.signedUrl });
});

// Standalone listen (dev / Render / Railway). On Vercel the app is mounted
// as a serverless function via api/index.js — never bind a port there.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[server] STΔN studio. order pipeline listening on :${PORT}`);
  });
}

export default app;

// ═══════════════════════════════════════════════════════════════════════════
// Titan Mail — admin inbox (IMAP sync + SMTP send)
// ═══════════════════════════════════════════════════════════════════════════

// Cached inbox list (light rows — no bodies; bodies load per message)
app.get('/api/admin/emails', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { data, error } = await supabase
    .from('emails')
    .select('message_id, sender, recipient, subject, is_read, received_at')
    .order('received_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ ok: false, error: `Emails cache unavailable — run supabase/schema.sql (${error.message})` });
  res.json({ ok: true, emails: data, mailConfigured: mailConfigured() });
});

// Fresh IMAP fetch from Titan; returns the parsed messages directly so the
// panel renders instantly (the Supabase cache upsert happens inside sync).
app.post('/api/admin/emails/sync', emailSyncLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const limit = Math.min(Number(req.body?.limit) || 30, 100);
    const emails = await syncInbox(limit);
    res.json({ ok: true, synced: emails.length, emails });
  } catch (e) {
    console.error('[mail] sync failed:', e.message);
    res.status(502).json({ ok: false, error: `IMAP sync failed: ${e.message}` });
  }
});

// Full message (bodies) for the reader pane
app.get('/api/admin/emails/:messageId', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('message_id', req.params.messageId)
    .maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data) return res.status(404).json({ ok: false, error: 'Message not found — sync the inbox first' });
  res.json({ ok: true, email: data });
});

app.post('/api/admin/emails/read', adminLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const messageId = req.body?.message_id;
  if (!messageId) return res.status(400).json({ ok: false, error: 'message_id is required' });
  const { error } = await supabase.from('emails').update({ is_read: true }).eq('message_id', messageId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/emails/send', emailSendLimiter, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const result = await sendMail({
      to: req.body?.to,
      subject: req.body?.subject,
      text: req.body?.body,
    });
    res.json({ ok: true, messageId: result.messageId });
  } catch (e) {
    console.error('[mail] send failed:', e.message);
    res.status(502).json({ ok: false, error: `SMTP send failed: ${e.message}` });
  }
});
