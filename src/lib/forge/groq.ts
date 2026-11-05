/**
 * 3D Forge — Stage 1: LLM prompt sculptor (Groq llama-3.3-70b, free tier).
 * Rewrites a raw idol idea into a print-optimized statue prompt AND a short
 * Hunyuan3D caption. The system prompt hard-encodes FDM print geometry rules
 * so generated statues survive a real printer (approved spec 2026-11-06):
 * thick sturdy forms, nothing thin/floating detached from the body, a flat
 * connected base, deep-relief (not through-hole) carving.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const PRINT_RULES = [
  'SINGLE solid object: one connected silhouette, nothing detached.',
  'Thick sturdy geometry — no thin free-floating weapons/tridents/objects; any held item must merge into the body or rest on the base.',
  'A flat, connected lotus / pedestal base under the figure (the print sits on it).',
  'Deep relief carvings only — never through-holes or open cutouts.',
  'Front-facing orthographic view, centered, full figure visible with margin.',
  'White marble / carved stone sculpture style, matte, monochrome.',
  'Solid flat light-gray background, no environment, no harsh shadows, soft diffused studio light.',
  'Photo-realistic 3D render quality, sharp silhouette against the background (asset-friendly).',
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

export async function enhancePrompt(idea: string, groqKey: string, signal?: AbortSignal): Promise<EnhancedPrompt> {
  const fallback = templateEnhance(idea);
  if (!groqKey) return fallback;
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: idea },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 700,
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(content);
    if (!parsed?.imagePrompt || !parsed?.caption) return fallback;
    return { imagePrompt: parsed.imagePrompt, caption: parsed.caption, usedGroq: true };
  } catch {
    return fallback;
  }
}
