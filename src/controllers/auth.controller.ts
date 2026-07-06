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

// GET /api/auth/me — the currently authenticated admin (including mobile, which
// isn't carried on the JWT-derived req.admin).
export const me = asyncHandler(async (req, res) => {
  const admin = await Admin.findByPk(req.admin!.id)
  if (!admin) throw new HttpError(401, 'Invalid session')
  res.json({
    user: {
      id: admin.get('id'),
      name: admin.get('name'),
      email: admin.get('email'),
      mobile: admin.get('mobile'),
      sessionDuration: admin.get('sessionDuration'),
    },
  })
})

// PATCH /api/auth/profile — update the signed-in admin's own account details.
export const updateProfile = asyncHandler(async (req, res) => {
  const adminId = req.admin!.id
  const admin = await Admin.findByPk(adminId)
  if (!admin) throw new HttpError(401, 'Invalid session')

  const { name, email, mobile, sessionDuration } = req.body as {
    name: string
    email: string
    mobile?: string
    sessionDuration?: string
  }

  // Guard against claiming an email already used by another admin.
  if (email !== admin.get('email')) {
    const clash = await Admin.findOne({ where: { email } })
    if (clash) throw new HttpError(409, 'That email is already in use')
  }

  await admin.update({
    name,
    email,
    mobile: mobile ?? null,
    ...(sessionDuration ? { sessionDuration } : {}),
  })
  await audit(req, 'update', 'Admin', adminId, { name, email, mobile, sessionDuration })

  res.json({
    user: {
      id: adminId,
      name: admin.get('name'),
      email: admin.get('email'),
      mobile: admin.get('mobile'),
      sessionDuration: admin.get('sessionDuration'),
    },
  })
})

// POST /api/auth/change-password — verify the current password, then set a new one.
export const changePassword = asyncHandler(async (req, res) => {
  const adminId = req.admin!.id
  const admin = await Admin.findByPk(adminId)
  if (!admin) throw new HttpError(401, 'Invalid session')

  const { currentPassword, newPassword } = req.body as {
    currentPassword: string
    newPassword: string
  }

  const valid = bcrypt.compareSync(currentPassword, admin.get('passwordHash') as string)
  if (!valid) throw new HttpError(400, 'Current password is incorrect')

  await admin.update({ passwordHash: bcrypt.hashSync(newPassword, 10) })
  await audit(req, 'update', 'Admin', adminId, { password: '[changed]' })

  res.json({ success: true })
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
