import { SessionLog, AuditLog } from '../models/index.js'
import { asyncHandler } from '../utils/asyncHandler.js'

// GET /api/session-logs — most recent login sessions.
export const listSessions = asyncHandler(async (_req, res) => {
  const rows = await SessionLog.findAll({ order: [['loginAt', 'DESC']], limit: 500 })
  res.json(rows)
})

// GET /api/audit-logs — most recent state-changing actions.
export const listAudit = asyncHandler(async (_req, res) => {
  const rows = await AuditLog.findAll({ order: [['createdAt', 'DESC']], limit: 500 })
  res.json(rows)
})
