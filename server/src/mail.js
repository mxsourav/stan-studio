import 'dotenv/config';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { supabase } from './supabase.js';

/**
 * STΔN studio. — Titan Mail service (Name.com powered by Titan).
 * IMAP read path syncs the INBOX into the Supabase `emails` cache so the
 * admin panel loads instantly; SMTP path sends transactional mail directly
 * from the business address.
 */

const MAIL = {
  imapHost: process.env.IMAP_HOST || 'imap.titan.email',
  imapPort: Number(process.env.IMAP_PORT || 993),
  smtpHost: process.env.SMTP_HOST || 'smtp.titan.email',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  user: process.env.MAIL_USER,
  pass: process.env.MAIL_PASS,
};

export const mailConfigured = () => Boolean(MAIL.user && MAIL.pass);

const MAX_BODY_CHARS = 200_000; // keep rows lean; huge marketing HTML is truncated

/** Fetches the latest INBOX messages and upserts them into the cache. */
export async function syncInbox(limit = 30) {
  if (!mailConfigured()) throw new Error('Mail is not configured (MAIL_USER / MAIL_PASS missing)');

  const client = new ImapFlow({
    host: MAIL.imapHost,
    port: MAIL.imapPort,
    secure: true,
    auth: { user: MAIL.user, pass: MAIL.pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
  } catch (e) {
    if (e?.authenticationFailed) {
      throw new Error('Titan rejected the IMAP login (AUTHENTICATIONFAILED) — check MAIL_USER / MAIL_PASS in server/.env, or reset the mailbox password in Titan webmail');
    }
    throw e;
  }
  const lock = await client.getMailboxLock('INBOX');
  const rows = [];
  try {
    let uids = (await client.search({ all: true }, { uid: true })) || [];
    if (!uids.length) return rows;
    uids = uids.slice(-limit);

    for await (const msg of client.fetch(uids.join(','), { uid: true, flags: true, source: true }, { uid: true })) {
      let parsed;
      try {
        parsed = await simpleParser(msg.source);
      } catch {
        continue; // undecodable MIME — skip the message, never kill the sync
      }
      rows.push({
        message_id: parsed.messageId || `titan-${msg.uid}`,
        sender: parsed.from?.text || '',
        recipient: parsed.to?.text || MAIL.user,
        subject: parsed.subject || '(no subject)',
        body_html: parsed.html ? String(parsed.html).slice(0, MAX_BODY_CHARS) : null,
        body_text: parsed.text ? String(parsed.text).slice(0, MAX_BODY_CHARS) : null,
        is_read: msg.flags?.has('\\Seen') ?? false,
        received_at: (parsed.date || new Date()).toISOString(),
      });
    }
  } finally {
    lock.release();
    try { await client.logout(); } catch { /* already closed */ }
  }

  if (rows.length) {
    const { error } = await supabase.from('emails').upsert(rows, { onConflict: 'message_id' });
    if (error) console.error('[mail] cache upsert failed:', error.message);
  }
  return rows; // returned even when the cache write fails — UI renders fresh data
}

/** Sends a transactional email from the studio address via Titan SMTP. */
export async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) throw new Error('Mail is not configured (MAIL_USER / MAIL_PASS missing)');
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) throw new Error('A valid recipient is required');
  if (!subject || !String(subject).trim()) throw new Error('Subject is required');

  const transporter = nodemailer.createTransport({
    host: MAIL.smtpHost,
    port: MAIL.smtpPort,
    secure: MAIL.smtpPort === 465,
    auth: { user: MAIL.user, pass: MAIL.pass },
  });

  const body = String(text || '');
  let info;
  try {
    info = await transporter.sendMail({
      from: `STAN studio. <${MAIL.user}>`,
      to: String(to).trim(),
      subject: String(subject).trim(),
      text: body,
      html: body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'),
    });
  } catch (e) {
    if (e?.code === 'EAUTH') {
      throw new Error('Titan rejected the SMTP login (EAUTH) — check MAIL_USER / MAIL_PASS in server/.env');
    }
    throw e;
  }

  const row = {
    message_id: String(info.messageId || `sent-${Date.now()}`).replace(/[<>]/g, ''),
    sender: MAIL.user,
    recipient: String(to).trim(),
    subject: String(subject).trim(),
    body_html: body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'),
    body_text: body,
    is_read: true,
    received_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('emails').upsert(row, { onConflict: 'message_id' });
  if (error) console.error('[mail] sent-copy cache upsert failed:', error.message);

  return { messageId: row.message_id };
}
