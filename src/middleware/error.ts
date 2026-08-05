import type { Request, Response, NextFunction } from 'express'
import { HttpError } from '../utils/httpError.js'

// Central error handler — turns thrown errors into consistent JSON responses.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    // `code` is only included when the thrower set one, so existing callers keep
    // their exact { message } response shape.
    return res.status(err.status).json({
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
    })
  }
  // Express middleware sets a numeric `status`/`statusCode` on its own errors —
  // a missing file from express.static (404) or an over-sized body from the JSON
  // and raw body parsers (413). Without this they'd all be reported as 500s and
  // logged as unhandled, hiding the actual reason from the client.
  const status = (err as { status?: number; statusCode?: number } | null)?.status
    ?? (err as { statusCode?: number } | null)?.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return res.status(status).json({
      message: err instanceof Error ? err.message : 'Request failed',
    })
  }

  console.error('Unhandled error:', err)
  const message = err instanceof Error ? err.message : 'Internal server error'
  res.status(500).json({ message })
}

// 404 for unmatched API routes.
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: 'Not found' })
}
