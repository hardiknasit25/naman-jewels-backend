// Vercel serverless entry point.
//
// This project is a standard Express app (see ../src/app.ts) that normally runs
// with app.listen() in src/server.ts. Vercel's serverless platform can't use a
// long-running listener — it invokes this file's default export per request.
//
// vercel.json rewrites every incoming path to this function, and req.url keeps
// the original path (e.g. /api/auth/login), so the Express router mounted at
// "/api" handles it exactly as it does locally.
//
// Note: imports here are STATIC on purpose. A dynamic import() makes Vercel's
// bundler split ../src/app.js into a separate chunk, which its launcher then
// tries to load as a function entry — failing with "Invalid export found in
// module src/app.js" because app.ts has no default export. Static imports get
// bundled inline and avoid that.
import type { IncomingMessage, ServerResponse } from 'http'
import { createApp } from '../src/app.js'
import { initModels } from '../src/models/index.js'

// The Express app is itself a (req, res) handler. Build it once and reuse it
// across warm invocations. With the mysql2 driver bundled (see
// src/config/database.ts) and env vars configured, this no longer throws at
// import time.
const app = createApp() as unknown as (req: IncomingMessage, res: ServerResponse) => void

// Open the MySQL connection lazily, once per warm container. A DB failure must
// not crash the function: routes that don't touch the DB (e.g. /api/health)
// keep working, and DB-backed routes surface a normal Express error instead of
// an opaque FUNCTION_INVOCATION_FAILED. On failure the cache is reset so a later
// invocation can retry.
let dbReady: Promise<void> | null = null
function ensureDb(): Promise<void> {
  if (!dbReady) {
    dbReady = initModels().catch((err) => {
      dbReady = null
      throw err
    })
  }
  return dbReady
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureDb()
  } catch (err) {
    console.error('❌ Database initialisation failed:', err)
  }
  return app(req, res)
}
