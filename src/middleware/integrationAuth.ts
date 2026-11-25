import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'
import { HttpError } from '../utils/httpError.js'

// Hashed so every comparison is the same length, which timingSafeEqual needs.
const digest = (value: string) => createHash('sha256').update(value).digest()

const KEYS = env.DESKTOP_API_KEYS.split(',')
  .map((k) => k.trim())
  .filter(Boolean)
  .map(digest)

/**
 * Gate for the desktop software's integration API: a static key sent as the
 * `X-API-Key` header. Deliberately simpler than the admin JWT flow — the shop's
 * VB.NET program only has to add one header — while the key itself only reaches
 * the product endpoints mounted behind it.
 */
export function authenticateIntegration(req: Request, _res: Response, next: NextFunction) {
  if (KEYS.length === 0) {
    return next(new HttpError(503, 'Desktop API is not enabled on this server', 'disabled'))
  }
  const sent = req.header('x-api-key')?.trim()
  const ok = !!sent && KEYS.some((key) => timingSafeEqual(key, digest(sent)))
  if (!ok) return next(new HttpError(401, 'Invalid or missing API key', 'invalid_key'))
  next()
}
