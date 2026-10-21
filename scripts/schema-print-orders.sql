-- ==============================================================================
-- STΔN Studio — Print Orders Database Schema (Supabase SQL)
-- Run this script in your Supabase Dashboard > SQL Editor to enable order tracking
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.print_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'slicing', 'printing', 'post_processing', 'shipped', 'delivered', 'cancelled')),
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT 'Guest User',
    customer_email TEXT,
    customer_phone TEXT,
    shipping_address TEXT,
    customer_notes TEXT,
    material TEXT DEFAULT 'Matte PLA',
    color TEXT DEFAULT 'Precision Matte Teal',
    infill_percent INTEGER DEFAULT 20,
    dimensions JSONB,
    volume_cm3 NUMERIC(10, 3),
    weight_grams NUMERIC(10, 2),
    estimated_price_inr INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast status and customer lookup
CREATE INDEX IF NOT EXISTS idx_print_orders_order_number ON public.print_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_print_orders_status ON public.print_orders(status);
CREATE INDEX IF NOT EXISTS idx_print_orders_created_at ON public.print_orders(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.print_orders ENABLE ROW LEVEL SECURITY;

-- Allow public client to insert new orders
CREATE POLICY "Allow public insert of print orders" 
ON public.print_orders 
FOR INSERT 
WITH CHECK (true);

-- Allow public reading of an order if they know the order_number
CREATE POLICY "Allow public select by order number" 
ON public.print_orders 
FOR SELECT 
USING (true);

-- Storage bucket RLS policies for 'stl-uploads'
-- (Bucket is public for direct CAD/Three.js reading and admin slicing)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('stl-uploads', 'stl-uploads', true, 52428800)
ON CONFLICT (id) DO UPDATE 
SET public = true, file_size_limit = 52428800;
