import { DataTypes } from 'sequelize'
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
  await ensureColumns()
  initialized = true
}

// sequelize.sync() (without { alter }) creates missing tables but never adds new
// columns to existing ones. This idempotently adds columns introduced after a
// table was first created, without altering or dropping any existing data.
async function ensureColumns(): Promise<void> {
  const qi = sequelize.getQueryInterface()

  const additions: { table: string; column: string; spec: Parameters<typeof qi.addColumn>[2] }[] = [
    { table: 'tbl_products', column: 'images', spec: { type: DataTypes.JSON, allowNull: true } },
    {
      table: 'tbl_products',
      column: 'visibility',
      spec: { type: DataTypes.ENUM('public', 'private'), allowNull: false, defaultValue: 'public' },
    },
    { table: 'tbl_categories', column: 'imageUrl', spec: { type: DataTypes.TEXT('long'), allowNull: true } },
    { table: 'tbl_customers', column: 'passwordHash', spec: { type: DataTypes.STRING(200), allowNull: true } },
  ]

  for (const { table, column, spec } of additions) {
    try {
      const describe = await qi.describeTable(table)
      if (!describe[column]) {
        await qi.addColumn(table, column, spec)
        console.log(`🧩 Added missing column ${table}.${column}`)
      }
    } catch (err) {
      // Table may not exist yet on a fresh DB (sync just created it with the
      // column) — safe to ignore.
      console.warn(`⚠️  Could not ensure column ${table}.${column}:`, err)
    }
  }
}
