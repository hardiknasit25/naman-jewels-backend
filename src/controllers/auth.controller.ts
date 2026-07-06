import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Admin, SessionLog } from '../models/index.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { newId } from '../utils/id.js'
import { audit } from '../services/audit.js'
import type { JwtPayload } from '../middleware/auth.js'

// Map the preset session durations to values jsonwebtoken's `expiresIn` accepts.
const DURATION_TO_JWT: Record<string, string> = {
  '2h': '2h',
  '4h': '4h',
  '12h': '12h',
  '1d': '1d',
  '1w': '7d',
  '1m': '30d',
}

// POST /api/auth/login — verify credentials, issue a JWT whose expiry equals the
// admin's own sessionDuration, and open a session log entry.
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string }

  const admin = await Admin.findOne({ where: { email } })
  const valid = admin && bcrypt.compareSync(password, admin.get('passwordHash') as string)
  if (!admin || !valid) throw new HttpError(401, 'Invalid email or password')

  const sessionDuration = admin.get('sessionDuration') as string
  const expiresIn = DURATION_TO_JWT[sessionDuration] ?? '1d'
  const jti = newId('jti')
  const adminId = admin.get('id') as number
  const adminEmail = admin.get('email') as string

  const token = jwt.sign({ sub: adminId, email: adminEmail, jti }, env.JWT_SECRET, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  })
  const decoded = jwt.decode(token) as { exp: number }

  await SessionLog.create({
    adminId,
    email: adminEmail,
    jti,
    ip: req.ip ?? null,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 500),
    loginAt: new Date(),
    expiresAt: new Date(decoded.exp * 1000),
    active: true,
    createdAt: new Date(),
  })
  await audit(req, 'login', 'Admin', adminId, null, { id: adminId, email: adminEmail })

  res.json({
    token,
    user: {
      id: adminId,
      name: admin.get('name'),
      email: adminEmail,
      mobile: admin.get('mobile'),
      sessionDuration,
    },
  })
})

// GET /api/auth/me — the currently authenticated admin.
export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.admin })
})

// POST /api/auth/logout — close the session matching this token (best-effort).
export const logout = asyncHandler(async (req, res) => {
  const header = req.headers.authorization ?? ''
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET) as unknown as JwtPayload
      await SessionLog.update(
        { active: false, logoutAt: new Date() },
        { where: { jti: payload.jti, active: true } }
      )
      await audit(req, 'logout', 'Admin', payload.sub, null, {
        id: payload.sub,
        email: payload.email,
      })
    } catch {
      /* token already invalid/expired — nothing to close */
    }
  }
  res.json({ success: true })
})
