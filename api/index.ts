// Vercel serverless entry point.
//
// This project is a standard Express app (see ../src/app.ts) that normally runs
// with app.listen() in src/server.ts. Vercel's serverless platform can't use a
// long-running listener — it invokes an exported handler per request instead.
//
// vercel.json rewrites every incoming path to this function, and req.url keeps
// the original path (e.g. /api/auth/login), so the Express router mounted at
// "/api" handles it exactly as it does locally.
import type { IncomingMessage, ServerResponse } from 'http'

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void

// Build the Express app + DB connection lazily, inside an async function rather
// than at module top level. This is deliberate: config errors (e.g. a missing
// env var, which src/config/env.ts throws on) then surface as a readable JSON
// 500 below, instead of collapsing into an opaque FUNCTION_INVOCATION_FAILED
// crash page that hides the real cause. The promise is cached across warm
// invocations; on failure the cache is reset so a later request can retry.
let appPromise: Promise<NodeHandler> | null = null
function getApp(): Promise<NodeHandler> {
  if (!appPromise) {
    appPromise = (async () => {
      const { createApp } = await import('../src/app.js')
      const { initModels } = await import('../src/models/index.js')
      const app = createApp() as unknown as NodeHandler
      try {
        // Connect to MySQL once per warm container. A DB failure must not kill
        // the whole app: routes that don't need the DB (e.g. /api/health) keep
        // working, and DB-backed routes return a normal Express error.
        await initModels()
      } catch (err) {
        console.error('❌ Database initialisation failed:', err)
      }
      return app
    })().catch((err) => {
      appPromise = null
      throw err
    })
  }
  return appPromise
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp()
    return app(req, res)
  } catch (err) {
    // The app itself couldn't be built — almost always a bad/missing env var.
    // Respond with the actual message (and CORS headers, so the browser shows
    // it rather than masking it as a CORS error) instead of crashing.
    const detail = err instanceof Error ? err.message : String(err)
    console.error('❌ Function failed to initialise:', err)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'Server configuration error', detail }))
  }
}
