import { supabase, ORDER_ASSETS_BUCKET, isSupabaseConfigured } from './supabase';
import type { LampConfig } from '../engine/types';

/**
 * Deterministic-recipe order pipeline. Heavy STL files never leave the
 * browser — only the lightweight source image and a ~1 KB JSON recipe are
 * stored; any machine can rebuild the exact model from those two artifacts.
 */

export interface OrderRecord {
  id: string;
  order_id: string;
  customer_name: string;
  customer_phone: string;
  image_path: string;
  config_json: LampConfig & { bomTotal: number };
  bom_total: number;
  status: 'pending' | 'printing' | 'dispatched';
  created_at: string;
}

export function generateOrderId(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `SB-${hex}`;
}

export async function submitShadowOrder(params: {
  imageFile: File;
  config: LampConfig;
  bomTotal: number;
  customerName: string;
  customerPhone: string;
}): Promise<{ orderId: string; whatsappUrl: string; whatsappMessage: string }> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const orderId = generateOrderId();
  const safeName = params.imageFile.name.replace(/[^\w.-]+/g, '_').slice(-64) || 'artwork.png';
  const imagePath = `recipes/${Date.now()}_${orderId}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ORDER_ASSETS_BUCKET)
    .upload(imagePath, params.imageFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: params.imageFile.type || 'image/png',
    });
  if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

  const { error: insertError } = await supabase.from('orders').insert({
    order_id: orderId,
    customer_name: params.customerName,
    customer_phone: params.customerPhone,
    image_path: imagePath,
    config_json: { ...params.config, bomTotal: params.bomTotal },
    bom_total: params.bomTotal,
    status: 'pending',
  });
  if (insertError) throw new Error(`Order save failed: ${insertError.message}`);

  const message = `Hi STAN studio! I configured a Custom Shadow Lamp. Order ID: #${orderId} | Shape: ${params.config.shape} | Est. Bill: ₹${Math.round(params.bomTotal)}. Ready to confirm!`;
  const whatsappUrl = `https://wa.me/${import.meta.env.VITE_WHATSAPP_NUMBER ?? '919999999999'}?text=${encodeURIComponent(message)}`;
  return { orderId, whatsappUrl, whatsappMessage: message };
}

export async function fetchOrders(): Promise<OrderRecord[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as OrderRecord[];
}

export async function updateOrderStatus(id: string, status: OrderRecord['status']): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function publicImageUrl(imagePath: string): Promise<string> {
  const { data } = await supabase.storage.from(ORDER_ASSETS_BUCKET).getPublicUrl(imagePath);
  return data.publicUrl;
}

/** The order-assets bucket is private; admins read artwork via signed URLs. */
export async function signedImageUrl(imagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ORDER_ASSETS_BUCKET)
    .createSignedUrl(imagePath, 3600);
  if (error || !data) throw new Error(`Could not fetch artwork: ${error?.message ?? 'unknown error'}`);
  return data.signedUrl;
}
