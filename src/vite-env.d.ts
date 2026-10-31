/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_WHATSAPP_NUMBER?: string;
  readonly VITE_ADMIN_EMAIL?: string;
  readonly VITE_RATE_PER_GRAM?: string;
  readonly VITE_LED_COST?: string;
  readonly VITE_BASE_FEE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
