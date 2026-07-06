// Vercel serverless entry point.
//
// This project is a standard Express app (see ../src/app.ts) that normally runs
// with app.listen() in src/server.ts. Vercel's serverless platform can't use a
// long-running listener — it invokes an exported handler per request instead.
//
// vercel.json rewrites every incoming path to this function, and req.url keeps
// the original path (e.g. /api/auth/login), so the Express router mounted at
// "/api" handles it exactly as it does locally.
import { createApp } from '../src/app.js'
import { initModels } from '../src/models/index.js'

// Build the Express app once and reuse it across warm invocations. The CORS
// middleware is active immediately, so even error responses carry CORS headers.
const app = createApp()

// Connect to MySQL lazily, once per container, and cache the promise. On
// failure we reset the cache so a later invocation can retry.
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

export default async function handler(req: unknown, res: unknown) {
  try {
    await ensureDb()
  } catch (err) {
    // Don't hard-crash the function: fall through to the Express app so CORS +
    // the central error handler still respond. A route that needs the DB will
    // return a normal CORS-enabled 500 instead of an opaque, header-less
    // FUNCTION_INVOCATION_FAILED (which the browser misreports as a CORS error).
    console.error('❌ Database initialisation failed:', err)
  }
  // The Express app is itself a (req, res) request listener.
  return (app as (req: unknown, res: unknown) => void)(req, res)
}
