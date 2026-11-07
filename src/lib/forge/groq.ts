/**
 * 3D Forge — Stage 1: LLM prompt sculptor (Groq llama-3.3-70b, free tier).
 * Rewrites a raw idea into a print-optimized image prompt AND a short
 * image-to-3D caption. The system prompt hard-encodes FDM print geometry
 * rules so generated pieces survive a real printer (approved spec
 * 2026-11-06, décor retune 2026-11-07): thick sturdy forms, nothing
 * thin/floating detached, a flat connected base, deep-relief carving — and
 * an explicit NEVER-an-action-figure rule: the studio prints decorative
 * showpieces and idols, never toys.
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
  // — style rules: templateEnhance injects everything from this index —
  'Front-facing orthographic view, centered, full subject visible with margin.',
  'NEVER an action figure or toy: no articulated joints, no cartoon proportions, no oversized head, no display box, no figurine stand or plinth plate, no brand or character styling.',
  'Decorative showpieces must read as elegant home / pooja-room décor: stable wide base for shelf or table placement, sculptural silhouette, graceful curves that survive FDM printing.',
  'Engravings, jaali lattices, mandala / om / floral ornament are welcome as deep relief on idols and décor alike.',
  'Exquisite digital clay sculpture / matte stone temple carving style, high-end ZBrush clay render fidelity, monochrome warm-gray.',
  'Hyper-detailed micro-relief where the subject calls for it: ornate crown filigree, necklace beads, armlets, serene facial anatomy, crisp drapery folds, defined lotus petals — or crisp engraved ornament on décor pieces.',
  'Solid flat light-gray background, no environment, no harsh shadows, soft diffused studio lighting with subtle ambient occlusion.',
  'Razor-sharp geometric edges and high contrast contours for 3D reconstruction.',
];

const SYSTEM_PROMPT = `You are the prompt sculptor for an AI 3D-printing studio that prints devotional idols AND elegant decorative showpieces — diya stands, oil lamps, incense holders, vases, bells, urli bowls, wall panels, torans, name plates — in solid white PLA on FDM printers.

First classify the user's idea: "deity idol", "devotional décor", or "decorative object". Shape the imagePrompt for that class:
- deity idol → keep iconography exact (attributes, posture, mount, expression).
- decorative object → emphasize form, symmetry, engraved ornament, the surface it lives on (wall, desk, table), and printability. Do not invent a figure unless the idea names one.

Given the idea, respond with JSON:
{
  "imagePrompt": "one paragraph for a text-to-image model, following every PRINT RULE below",
  "caption": "max 12 words describing the SUBJECT ONLY (e.g. 'Lord Ganesha seated on lotus, four arms, ornate crown' or 'brass-style diya stand with engraved om, wide stable base') for an image-to-3D model"
}

PRINT RULES (mandatory):
${PRINT_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Keep the imagePrompt under 90 words, comma-separated descriptors, no sentences like "this shows".`;

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
