-- ==============================================================================
-- STAN studio. — Shadow Lamp "Deterministic Recipe" order pipeline schema
-- Run in Supabase Dashboard > SQL Editor.
-- Heavy STL files are never uploaded: only the source image (<1 MB) plus a
-- ~1 KB config_json recipe that deterministically rebuilds the model.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        TEXT UNIQUE NOT NULL,              -- e.g. SB-4F2A
    customer_name   TEXT NOT NULL,
    customer_phone  TEXT NOT NULL,
    image_path      TEXT NOT NULL,                     -- path inside 'order-assets'
    config_json     JSONB NOT NULL,                    -- all slider values + shape + BOM
    bom_total       NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'printing', 'dispatched')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Anyone may submit an order recipe (insert-only).
CREATE POLICY "Allow public order submission"
ON public.orders FOR INSERT
WITH CHECK (true);

-- Only authenticated admins (Supabase Auth) may read/update orders.
CREATE POLICY "Admins may read orders"
ON public.orders FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins may update orders"
ON public.orders FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Storage: private bucket holding only lightweight source images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'order-assets',
    'order-assets',
    false,
    26214400,
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

-- Public may upload their own artwork; admins may read them back.
CREATE POLICY "Allow public artwork upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'order-assets');

CREATE POLICY "Admins may read order assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'order-assets');
