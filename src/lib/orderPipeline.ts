/**
 * STΔN studio. — Production order pipeline (client side).
 *
 * Primary path: POST {VITE_API_BASE}/api/orders (the dedicated backend).
 * Fallback path: direct Supabase insert (anon insert-only policy) with a
 * client-generated STAN-YYMMDD-XXXX order id — works serverless-only.
 */

import { supabase } from './supabase';

export interface OrderPayload {
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  customer_notes?: string;
  recipe_json: Record<string, unknown>;
  design_svg: string;
  design_name?: string;
  plate_svg?: string | null;
  preview_data_url?: string;
  bom_json: Record<string, unknown>;
  total_inr: number;
}

export interface OrderResult {
  ok: boolean;
  orderId: string;
  whatsappUrl: string;
  via: 'backend' | 'supabase-fallback';
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const WA_NUMBER = '918509986008';

export function generateOrderId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `STAN-${yy}${mm}${dd}-${rand}`;
}

export function buildWhatsAppUrl(orderId: string, p: OrderPayload): string {
  const bom = p.bom_json as Record<string, string>;
  const lines = [
    `Order ID: #${orderId}`,
    `Name: ${p.customer_name}`,
    `Phone: ${p.customer_phone}`,
    p.customer_address ? `Address: ${p.customer_address}` : null,
    `Shape: ${p.recipe_json.shape} | Box: ${bom.box_outer_size || ''} | Shadow: ${bom.shadow_size || ''}`,
    `LED: ${bom.led_eff_mm || ''} mm | Panel: ${bom.panel_eff_mm || ''} mm`,
    `Material: ${bom.material || 'PLA'} | Weight: ${bom.weight_g || ''} g | Total: ₹${p.total_inr}`,
    `My 3D design & recipe are saved under Order #${orderId}.`,
  ].filter(Boolean);
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/** Submits via the backend when configured, else directly into Supabase. */
export async function submitOrder(p: OrderPayload): Promise<OrderResult> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, orderId: data.orderId, whatsappUrl: buildWhatsAppUrl(data.orderId, p), via: 'backend' };
    }
    // fall through to the Supabase fallback on backend failure
  }

  const orderId = generateOrderId();
  const { error } = await supabase.from('orders').insert({
    order_id: orderId,
    customer_name: p.customer_name,
    customer_phone: p.customer_phone,
    customer_address: p.customer_address || null,
    customer_notes: p.customer_notes || null,
    recipe_json: p.recipe_json,
    design_svg: p.design_svg,
    design_name: p.design_name || null,
    plate_svg: p.plate_svg || null,
    preview_data_url: p.preview_data_url || null,
    bom_json: p.bom_json,
    total_inr: p.total_inr,
  });
  if (error) throw new Error(`Order save failed: ${error.message}`);
  return { ok: true, orderId, whatsappUrl: buildWhatsAppUrl(orderId, p), via: 'supabase-fallback' };
}

export interface AdminOrder {
  id: string;
  order_id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  customer_notes: string | null;
  status: string;
  recipe_json: Record<string, unknown>;
  design_svg: string;
  design_name: string | null;
  plate_svg: string | null;
  preview_data_url: string | null;
  bom_json: Record<string, string | number>;
  total_inr: number;
}

const ADMIN_KEY = (import.meta.env.VITE_ADMIN_PASSKEY as string | undefined) || 'stan-admin-2026';

export function adminApiConfigured(): boolean {
  return Boolean(API_BASE);
}

export async function adminFetchOrders(): Promise<AdminOrder[]> {
  const res = await fetch(`${API_BASE}/api/admin/orders`, {
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  if (!res.ok) throw new Error(`Admin API ${res.status}`);
  const data = await res.json();
  return data.orders as AdminOrder[];
}

export async function adminUpdateStatus(orderId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Status update failed (${res.status})`);
}
