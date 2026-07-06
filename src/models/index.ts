import { sequelize, ensureDatabase } from '../config/database.js'
import { Admin } from './Admin.js'
import { CustomerType } from './CustomerType.js'
import { Customer } from './Customer.js'
import { Category } from './Category.js'
import { Product } from './Product.js'
import { Banner } from './Banner.js'
import { StaticPage } from './StaticPage.js'
import { Inquiry } from './Inquiry.js'
import { SessionLog } from './SessionLog.js'
import { AuditLog } from './AuditLog.js'

export {
  sequelize,
  Admin,
  CustomerType,
  Customer,
  Category,
  Product,
  Banner,
  StaticPage,
  Inquiry,
  SessionLog,
  AuditLog,
}

// Note: relationships are kept as plain string ids (no hard FK constraints), so
// deletes behave like the original frontend mock — e.g. removing a category
// that still has products doesn't fail. The UI resolves relations by id.

let initialized = false

// Connect, create the schema if needed, and sync all tables. Idempotent.
export async function initModels(): Promise<void> {
  if (initialized) return
  // Managed/shared MySQL hosts (and Vercel) usually forbid CREATE DATABASE and
  // ship the schema pre-created. Treat this as best-effort so a permission error
  // here doesn't block startup when the database already exists.
  try {
    await ensureDatabase()
  } catch (err) {
    console.warn('⚠️  Skipping database creation (assuming it already exists):', err)
  }
  await sequelize.authenticate()
  await sequelize.sync()
  initialized = true
}
