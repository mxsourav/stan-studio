/**
 * 3D Forge — Stage 1: LLM prompt sculptor (Groq llama-3.3-70b, free tier).
 * Rewrites a raw idol idea into a print-optimized statue prompt AND a short
 * Hunyuan3D caption. The system prompt hard-encodes FDM print geometry rules
 * so generated statues survive a real printer (approved spec 2026-11-06):
 * thick sturdy forms, nothing thin/floating detached from the body, a flat
 * connected base, deep-relief (not through-hole) carving.
 */

const MODEL = 'qwen/qwen3.8-27b'; // llama-3.3 left Groq's free tier — Qwen is the active slot
// api.groq.com blocks browser-origin calls (CORS) — relay through the
// studio's own serverless backend, which forwards to Groq server-to-server.
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '')) || '';
const PROXY_URL = `${API_BASE}/api/forge/groq`;

const PRINT_RULES = [
  'SINGLE solid object: one connected silhouette, nothing detached.',
  'Thick sturdy geometry — no thin free-floating weapons/tridents/objects; any held item must merge into the body or rest on the base.',
  'A flat, connected lotus / pedestal base under the figure (the print sits on it).',
  'Deep relief carvings only — never through-holes or open cutouts.',
  'Front-facing orthographic view, centered, full figure visible with margin.',
  'Exquisite digital clay sculpture / matte stone temple carving style, high-end ZBrush clay render fidelity, monochrome warm-gray.',
  'Hyper-detailed micro-relief: sharp ornate mukut crown filigree, kantha necklace beads, bajuband armlets, well-defined closed eyelids and serene facial anatomy, crisp flowing drapery folds, defined lotus petals.',
  'Solid flat light-gray background, no environment, no harsh shadows, soft diffused studio lighting with subtle ambient occlusion.',
  'Razor-sharp geometric edges and high contrast contours for 3D reconstruction.',
];

const SYSTEM_PROMPT = `You are the prompt sculptor for an AI 3D-printing studio that prints Hindu deities and temple architecture in solid white PLA on FDM printers.

Given a raw idol idea, respond with JSON:
{
  "imagePrompt": "one paragraph for a text-to-image model, following every PRINT RULE below",
  "caption": "max 12 words describing the SUBJECT ONLY (e.g. 'Lord Ganesha seated on lotus, four arms, ornate crown') for an image-to-3D model"
}

PRINT RULES (mandatory):
${PRINT_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Keep the imagePrompt under 90 words, comma-separated descriptors, no sentences like "this shows". Keep the deity's iconography accurate (attributes, posture, mount).`;

export interface EnhancedPrompt {
  imagePrompt: string;
  caption: string;
  usedGroq: boolean;
}

/** Deterministic offline fallback — the tool never hard-blocks without a key. */
function templateEnhance(idea: string): EnhancedPrompt {
  const subject = idea.trim().replace(/\s+/g, ' ');
  return {
    imagePrompt: `${subject}, ${PRINT_RULES.slice(4).join(', ')}`,
    caption: subject.slice(0, 90),
    usedGroq: false,
  };
}

function extractJson(text: string): { imagePrompt?: string; caption?: string } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Auto-adapt when a model id vanishes from the free tier: pick the first
 *  active chat model that isn't a guard/safety filter. */
async function resolveModel(apiKey: string, signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ apiKey, path: 'models' }),
    });
    if (!res.ok) return MODEL;
    const data = (await res.json()) as { data?: Array<{ id?: string; active?: boolean }> };
    const candidates = (data.data ?? [])
      .filter((m) => m.active !== false && m.id && !/guard|whisper|tts|embed/i.test(m.id))
      .map((m) => m.id!);
    if (candidates.includes(MODEL)) return MODEL;
    return candidates[0] ?? MODEL;
  } catch {
    return MODEL;
  }
}

export async function enhancePrompt(idea: string, groqKey: string, signal?: AbortSignal): Promise<EnhancedPrompt> {
  const fallback = templateEnhance(idea);
  if (!groqKey) return fallback;
  try {
    const model = await resolveModel(groqKey, signal);
    const payload = {
      apiKey: groqKey,
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: idea },
      ],
      temperature: 0.7,
      max_tokens: 700,
    };
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(payload),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(content);
    if (!parsed?.imagePrompt) return fallback;
    const caption = parsed.caption ?? idea.trim().replace(/\s+/g, ' ').slice(0, 90);
    return { imagePrompt: parsed.imagePrompt, caption, usedGroq: true };
  } catch {
    return fallback;
  }
}
