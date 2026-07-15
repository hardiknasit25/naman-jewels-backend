import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Admin } from '../models/index.js'
import { HttpError } from '../utils/httpError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export interface JwtPayload {
  sub: number
  email: string
  jti: string
  /** Set only on customer-app tokens; admin tokens never carry an audience. */
  aud?: string
}

// Verifies the Bearer JWT and attaches the admin to req.admin. A missing,
// invalid, or expired token yields 401 (the frontend then redirects to login).
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication required')
  }

  const token = header.slice('Bearer '.length)
  let payload: JwtPayload
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again')
  }

  // Customer-app tokens are signed with the same secret and carry a numeric `sub`
  // from a different table, so without this check a customer token would
  // authenticate as the admin sharing its id. Admin tokens set no audience.
  if (payload.aud) throw new HttpError(401, 'Invalid session')

  const admin = await Admin.findByPk(payload.sub)
  if (!admin) throw new HttpError(401, 'Invalid session')

  req.admin = {
    id: admin.get('id') as number,
    email: admin.get('email') as string,
    name: admin.get('name') as string,
    sessionDuration: admin.get('sessionDuration') as string,
  }
  next()
})
