import express, { type Express } from 'express'
import cors from 'cors'
import compression from 'compression'
import { apiRouter } from './routes/api.js'
import { errorHandler } from './middleware/error.js'
import { UPLOAD_ROOT, UPLOAD_URL_PREFIX } from './services/uploads.js'
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

  // Images are uploaded as raw bytes to /api/uploads and referenced by URL, so
  // JSON bodies no longer carry them. The limit stays generous only for static
  // page HTML, which can still be long.
  app.use(express.json({ limit: '5mb' }))

  // Uploaded images. Filenames are content hashes, so a given URL's bytes can
  // never change — hence the permanent cache header. This is the whole point of
  // moving off Base64: the browser and any CDN can keep these forever instead of
  // re-downloading them inside every API response.
  app.use(
    UPLOAD_URL_PREFIX,
    express.static(UPLOAD_ROOT, {
      immutable: true,
      maxAge: '1y',
      // Nothing here is generated on the fly; a miss is a genuinely missing file.
      fallthrough: false,
    })
  )

  // All backend endpoints live under /api.
  app.use('/api', apiRouter)

  // Central error handler — must be registered last.
  app.use(errorHandler)

  return app
}
