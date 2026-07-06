import express, { type Express } from 'express'
import cors from 'cors'
import compression from 'compression'
import { apiRouter } from './routes/api.js'
import { errorHandler } from './middleware/error.js'
import { env } from './config/env.js'

export function createApp(): Express {
  const app = express()

  app.use(compression())

  // The frontend is a separate app deployed on its own origin, so it talks to
  // this API cross-origin. CORS_ORIGIN controls which origins are allowed:
  //   - "*" (default) allows any origin
  //   - a comma-separated list restricts to those exact origins
  // Auth uses a Bearer token (not cookies), so credentials aren't required.
  const allowed = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  app.use(
    cors({
      origin: allowed.includes('*') ? true : allowed,
    })
  )

  // Base64 images are embedded in JSON bodies, so allow a generous limit.
  app.use(express.json({ limit: '15mb' }))

  // All backend endpoints live under /api.
  app.use('/api', apiRouter)

  // Central error handler — must be registered last.
  app.use(errorHandler)

  return app
}
