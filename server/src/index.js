import express from 'express';
import cors from 'cors';
import { supabase, ADMIN_SECRET_KEY, PORT, ALLOWED_ORIGIN } from './supabase.js';
import { syncInbox, sendMail, mailConfigured } from './mail.js';

const app = express();
app.use(express.json({ limit: '4mb' })); // recipes + SVG strings + webp preview
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGIN.length === 0 || ALLOWED_ORIGIN.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
  }),
);

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

function requireAdmin(req, res) {
  const key = req.get('x-admin-key');
  if (!key || key !== ADMIN_SECRET_KEY) {
    res.status(401).json({ ok: false, error: 'Unauthorized — invalid admin key' });
    return false;
  }
  return true;
}

// ─── submit an order ─────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
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

// ─── admin: list orders ──────────────────────────────────────────────────────
app.get('/api/admin/orders', async (req, res) => {
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
app.patch('/api/admin/orders/:orderId', async (req, res) => {
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
app.get('/api/admin/emails', async (req, res) => {
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
app.post('/api/admin/emails/sync', async (req, res) => {
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
app.get('/api/admin/emails/:messageId', async (req, res) => {
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

app.post('/api/admin/emails/read', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const messageId = req.body?.message_id;
  if (!messageId) return res.status(400).json({ ok: false, error: 'message_id is required' });
  const { error } = await supabase.from('emails').update({ is_read: true }).eq('message_id', messageId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/emails/send', async (req, res) => {
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
