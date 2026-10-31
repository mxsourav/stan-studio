/**
 * STΔN studio. — Mailbox admin client (Titan Mail via the dedicated backend).
 * Every call goes to {VITE_API_BASE}/api/admin/emails with the x-admin-key
 * header — there is no direct-Supabase fallback: the mailbox is server-only
 * because anon clients must never read email content.
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const ADMIN_KEY = (import.meta.env.VITE_ADMIN_PASSKEY as string | undefined) || 'stan-admin-2026';

export interface MailListItem {
  message_id: string;
  sender: string;
  recipient: string;
  subject: string;
  is_read: boolean;
  received_at: string;
}

export interface MailMessage extends MailListItem {
  body_html: string | null;
  body_text: string | null;
}

const headers = () => ({ 'x-admin-key': ADMIN_KEY });

export function mailApiConfigured(): boolean {
  return Boolean(API_BASE);
}

/** Cached inbox list (light rows — bodies load per message). */
export async function adminFetchEmails(): Promise<MailListItem[]> {
  const res = await fetch(`${API_BASE}/api/admin/emails`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Mailbox API ${res.status}`);
  return data.emails as MailListItem[];
}

/** Fresh IMAP fetch from Titan — returns the parsed messages immediately. */
export async function adminSyncEmails(limit = 30): Promise<{ synced: number; emails: MailMessage[] }> {
  const res = await fetch(`${API_BASE}/api/admin/emails/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({ limit }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `IMAP sync failed (${res.status})`);
  return { synced: data.synced, emails: data.emails as MailMessage[] };
}

/** Full message with bodies for the reader pane. */
export async function adminFetchEmailBody(messageId: string): Promise<MailMessage> {
  const res = await fetch(`${API_BASE}/api/admin/emails/${encodeURIComponent(messageId)}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Message fetch failed (${res.status})`);
  return data.email as MailMessage;
}

export async function adminMarkEmailRead(messageId: string): Promise<void> {
  await fetch(`${API_BASE}/api/admin/emails/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({ message_id: messageId }),
  });
}

/** Sends from stanstudio@… via Titan SMTP. */
export async function adminSendEmail(to: string, subject: string, body: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/emails/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({ to, subject, body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `SMTP send failed (${res.status})`);
}
