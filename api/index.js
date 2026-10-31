import app from '../server/src/index.js';

/**
 * Vercel serverless entry — the same Express app that runs standalone in
 * server/ (dev) and on Render/Railway, mounted at /api/* via the rewrite in
 * vercel.json. maxDuration 60s covers a cold IMAP sync (30 messages).
 */
export const maxDuration = 60;

export default app;
