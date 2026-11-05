/**
 * 3D Forge — Stage 2: statue reference image via Pollinations (anonymous,
 * zero-auth FLUX endpoint; free with soft rate limits). A fixed seed makes
 * regenerations reproducible; bumping the seed explores variants.
 */

const IMAGE_URL = 'https://image.pollinations.ai/prompt/';

export function genImageUrl(prompt: string, seed: number, size = 1024): string {
  const params = new URLSearchParams({
    width: String(size),
    height: String(size),
    seed: String(seed),
    nologo: 'true',
    model: 'flux',
    referrer: 'stan-forge',
  });
  return `${IMAGE_URL}${encodeURIComponent(prompt)}?${params.toString()}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch the generated image as a Blob (needed for the HF upload), with
 *  retry/backoff for the anonymous rate limits. */
export async function fetchImageBlob(url: string, signal?: AbortSignal, tries = 3): Promise<Blob> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 1024 && blob.type.startsWith('image/')) return blob;
        throw new Error('pollinations returned an empty image');
      }
      lastErr = new Error(`pollinations ${res.status}`);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    }
    await sleep(1500 * (i + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error('image generation failed');
}
