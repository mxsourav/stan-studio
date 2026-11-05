/**
 * 3D Forge — BYOK key storage. The operator pastes their own free-tier keys
 * once; they live in localStorage only (never bundled, never sent anywhere
 * except their own API provider). Internal single-operator tool.
 */

const STORE_KEYS = {
  groq: 'stan:forge:groq-key',
  hf: 'stan:forge:hf-token',
  gemini: 'stan:forge:gemini-key',
} as const;

export type ForgeKeyName = keyof typeof STORE_KEYS;

export function getForgeKey(which: ForgeKeyName): string {
  try {
    return localStorage.getItem(STORE_KEYS[which]) ?? '';
  } catch {
    return '';
  }
}

export function setForgeKeys(values: Partial<Record<ForgeKeyName, string>>): void {
  for (const [name, value] of Object.entries(values)) {
    const key = STORE_KEYS[name as ForgeKeyName];
    if (!key) continue;
    try {
      if (value) localStorage.setItem(key, value.trim());
      else localStorage.removeItem(key);
    } catch {
      /* storage unavailable — keys stay session-only */
    }
  }
}

export function clearForgeKeys(): void {
  for (const key of Object.values(STORE_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
}
