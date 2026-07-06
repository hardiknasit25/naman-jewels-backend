import type { Request, Response, NextFunction } from 'express'
import type { ZodType } from 'zod'
import { HttpError } from '../utils/httpError.js'

// Validate (and coerce/strip) req.body against a Zod schema before the handler
// runs. On failure, responds with 400 and a readable message.
export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; ')
      return next(new HttpError(400, message))
    }
    req.body = parsed.data
    next()
  }
}
