import type { Request, Response, NextFunction } from 'express'
import { HttpError } from '../utils/httpError.js'

// Central error handler — turns thrown errors into consistent JSON responses.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message })
  }
  console.error('Unhandled error:', err)
  const message = err instanceof Error ? err.message : 'Internal server error'
  res.status(500).json({ message })
}

// 404 for unmatched API routes.
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: 'Not found' })
}
