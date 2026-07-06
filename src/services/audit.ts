import type { Request } from 'express'
import { AuditLog } from '../models/index.js'

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout'

interface Actor {
  id?: number | null
  email?: string | null
}

// Secrets are always fully masked, regardless of length.
const MASK_KEYS = new Set(['password', 'currentPassword', 'newPassword', 'passwordHash'])
// Large fields we truncate rather than dump verbatim.
const TRUNCATE_KEYS = new Set(['imageUrl', 'content'])

function redact(changes: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(changes)) {
    if (MASK_KEYS.has(key)) {
      out[key] = '[redacted]'
    } else if (TRUNCATE_KEYS.has(key) && typeof value === 'string' && value.length > 120) {
      out[key] = `[${key} omitted, ${value.length} chars]`
    } else {
      out[key] = value
    }
  }
  return out
}

// Records a state-changing action. Never throws — a failed audit write must not
// break the underlying request.
export async function audit(
  req: Request,
  action: AuditAction,
  entity: string,
  entityId: number | null,
  changes?: Record<string, unknown> | null,
  actor?: Actor
): Promise<void> {
  try {
    const who = actor ?? req.admin
    await AuditLog.create({
      adminId: who?.id ?? null,
      adminEmail: who?.email ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      changes: changes ? JSON.stringify(redact(changes)) : null,
      ip: req.ip ?? null,
      createdAt: new Date(),
    })
  } catch (e) {
    console.error('Failed to write audit log:', e)
  }
}
