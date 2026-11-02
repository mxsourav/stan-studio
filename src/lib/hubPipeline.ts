/**
 * STΔN studio. — Custom STL Hub ticket pipeline (client side).
 *
 * Primary path: POST {VITE_API_BASE}/api/hub-requests (the dedicated backend).
 * Fallback path: direct Supabase anon insert (insert-only policy).
 * STL files ride along client→Supabase Storage (private `stl-files` bucket),
 * never through the API (serverless body limits).
 */

import { supabase } from './supabase';

export interface HubRequestPayload {
  ticket_id: string;
  kind: 'commission' | 'sourcing';
  item_name: string;
  file_name?: string | null;
  specs?: Record<string, unknown> | null;
  params?: Record<string, unknown> | null;
  estimate?: Record<string, unknown> | null;
  note?: string | null;
  storage_path?: string | null;
}

export interface HubSubmitResult {
  ok: boolean;
  via: 'backend' | 'supabase-fallback';
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const ADMIN_KEY = (import.meta.env.VITE_ADMIN_PASSKEY as string | undefined) || 'stan-admin-2026';

/** Submits via the backend when configured, else directly into Supabase. */
export async function submitHubRequest(p: HubRequestPayload): Promise<HubSubmitResult> {
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/hub-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      if (res.ok) return { ok: true, via: 'backend' };
    } catch {
      // fall through to the Supabase fallback
    }
  }

  const { error } = await supabase.from('hub_requests').insert({
    ticket_id: p.ticket_id,
    kind: p.kind,
    item_name: p.item_name,
    file_name: p.file_name ?? null,
    specs: p.specs ?? null,
    params: p.params ?? null,
    estimate: p.estimate ?? null,
    note: p.note ?? null,
    storage_path: p.storage_path ?? null,
    status: 'new',
  });
  if (error) throw new Error(`Hub request save failed: ${error.message}`);
  return { ok: true, via: 'supabase-fallback' };
}

/** Uploads the client's STL to the private stl-files bucket. Returns the path. */
export async function uploadStlFile(ticketId: string, fileName: string, blob: Blob): Promise<string> {
  const path = `stl/${ticketId}/${fileName}`;
  const { error } = await supabase.storage.from('stl-files').upload(path, blob, {
    // Insert-only RLS — no upsert (conflicts impossible: the path is
    // namespaced by a fresh STAN-STL-XXXX ticket id).
    upsert: false,
    contentType: 'model/stl',
  });
  if (error) throw new Error(`STL upload failed: ${error.message}`);
  return path;
}

// ─── Admin surface ───────────────────────────────────────────────────────────

export interface HubRequestRow {
  id: string;
  ticket_id: string;
  kind: string;
  item_name: string;
  file_name: string | null;
  specs: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  estimate: Record<string, unknown> | null;
  note: string | null;
  storage_path: string | null;
  status: string;
  created_at: string;
}

export async function adminFetchHubRequests(): Promise<HubRequestRow[]> {
  const res = await fetch(`${API_BASE}/api/admin/hub-requests`, {
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  if (!res.ok) throw new Error(`Admin API ${res.status}`);
  const data = await res.json();
  return data.requests as HubRequestRow[];
}

/** Time-limited signed URL for a stored STL (private bucket). */
export async function adminStlFileUrl(ticketId: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/api/admin/hub-requests/${encodeURIComponent(ticketId)}/file`,
    { headers: { 'x-admin-key': ADMIN_KEY } },
  );
  if (!res.ok) throw new Error(`File URL failed (${res.status})`);
  const data = await res.json();
  return data.url as string;
}
