export const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined) ?? '919999999999';
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? '';

/** Pricing constants (INR). Defaults continue the previous ₹3.50/g + ₹80 LED + ₹195 prep formula. */
export const FILAMENT_RATE_PER_GRAM = Number(import.meta.env.VITE_RATE_PER_GRAM ?? 3.5);
export const LED_HARDWARE_COST = Number(import.meta.env.VITE_LED_COST ?? 80);
export const BASE_MANUFACTURING_FEE = Number(import.meta.env.VITE_BASE_FEE ?? 195);

export const BRAND = { stan: 'STAN', studio: 'studio' } as const;
