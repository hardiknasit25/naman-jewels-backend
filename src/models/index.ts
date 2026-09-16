import { DataTypes, QueryTypes } from 'sequelize'
import { sequelize, ensureDatabase } from '../config/database.js'
import { Admin } from './Admin.js'
import { CustomerType } from './CustomerType.js'
import { Customer } from './Customer.js'
import { Category } from './Category.js'
import { Carat } from './Carat.js'
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
  Carat,
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
  await ensureCustomerColumnsNullable()
  await ensureProductSkuUnique()
  initialized = true
}

// email/address used to be required at registration; they no longer are (see
// Customer.ts). sequelize.sync() never loosens an existing column's NOT NULL
// constraint on its own, so without this an older database would still reject
// a registration or admin-add that omits them. Safe to re-run every boot —
// it only widens the constraint, never narrows it or touches data.
async function ensureCustomerColumnsNullable(): Promise<void> {
  const qi = sequelize.getQueryInterface()
  for (const { column, type } of [
    { column: 'email', type: DataTypes.STRING(180) },
    { column: 'address', type: DataTypes.STRING(500) },
  ] as const) {
    try {
      await qi.changeColumn('tbl_customers', column, { type, allowNull: true })
    } catch (err) {
      console.warn(`⚠️  Could not relax tbl_customers.${column} to nullable:`, err)
    }
  }
}

// A product's SKU has to identify exactly one product (the /p/:sku share page
// resolves by it). Every write goes through the API's uniqueness check, but a
// database-level index is what makes it true under concurrent requests and for
// anything written outside the API.
//
// sequelize.sync() (no { alter }) only applies the model's `unique` flag to a
// table it creates, so existing databases are handled here. Deliberately
// conservative: if the table already holds duplicate SKUs, adding the index
// would fail — that's reported and skipped rather than allowed to block startup,
// and the API-level check still prevents new duplicates in the meantime.
async function ensureProductSkuUnique(): Promise<void> {
  const qi = sequelize.getQueryInterface()
  try {
    const indexes = (await qi.showIndex('tbl_products')) as {
      unique?: boolean
      fields?: { attribute: string }[]
    }[]
    const alreadyIndexed = indexes.some(
      (i) => i.unique && i.fields?.length === 1 && i.fields[0]?.attribute === 'sku'
    )
    if (alreadyIndexed) return

    const duplicates = (await sequelize.query(
      'SELECT sku, COUNT(*) AS total FROM tbl_products GROUP BY sku HAVING total > 1',
      { type: QueryTypes.SELECT }
    )) as { sku: string; total: number }[]

    if (duplicates.length > 0) {
      console.warn(
        `⚠️  Not adding the unique index on tbl_products.sku — ${duplicates.length} code(s) are used by more than one product: ` +
          `${duplicates.map((d) => `${d.sku} (×${d.total})`).join(', ')}. ` +
          'Give those products distinct codes and restart to have the index applied.'
      )
      return
    }

    await qi.addIndex('tbl_products', {
      fields: ['sku'],
      unique: true,
      name: 'tbl_products_sku_unique',
    })
    console.log('🧩 Added unique index on tbl_products.sku')
  } catch (err) {
    // Never fatal: the API-level check is the one users hit, and a host that
    // forbids DDL shouldn't stop the server from booting.
    console.warn('⚠️  Could not ensure the unique index on tbl_products.sku:', err)
  }
}

// sequelize.sync() (without { alter }) creates missing tables but never adds new
// columns to existing ones. This idempotently adds columns introduced after a
// table was first created, without altering or dropping any existing data.
async function ensureColumns(): Promise<void> {
  const qi = sequelize.getQueryInterface()

  const additions: {
    table: string
    column: string
    spec: Parameters<typeof qi.addColumn>[2]
    /** Runs once, right after the column is created, to seed existing rows. */
    afterAdd?: () => Promise<void>
  }[] = [
    { table: 'tbl_products', column: 'images', spec: { type: DataTypes.JSON, allowNull: true } },
    {
      table: 'tbl_products',
      column: 'status',
      spec: { type: DataTypes.ENUM('live', 'private'), allowNull: false, defaultValue: 'live' },
      afterAdd: backfillProductStatus,
    },
    { table: 'tbl_products', column: 'customerTypeIds', spec: { type: DataTypes.JSON, allowNull: true } },
    { table: 'tbl_products', column: 'lessFactors', spec: { type: DataTypes.JSON, allowNull: true } },
    {
      table: 'tbl_products',
      column: 'caratId',
      spec: { type: DataTypes.INTEGER, allowNull: true },
      afterAdd: backfillProductCarats,
    },
    { table: 'tbl_categories', column: 'imageUrl', spec: { type: DataTypes.TEXT('long'), allowNull: true } },
    {
      table: 'tbl_categories',
      column: 'sortOrder',
      spec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      afterAdd: backfillCategorySortOrder,
    },
    { table: 'tbl_customers', column: 'passwordHash', spec: { type: DataTypes.STRING(200), allowNull: true } },
    { table: 'tbl_customers', column: 'sessionInvalidatedAt', spec: { type: DataTypes.DATE, allowNull: true } },
    { table: 'tbl_customers', column: 'currentJti', spec: { type: DataTypes.STRING(64), allowNull: true } },
    { table: 'tbl_customers', column: 'activeSessionExpiresAt', spec: { type: DataTypes.DATE, allowNull: true } },
  ]

  for (const { table, column, spec, afterAdd } of additions) {
    try {
      const describe = await qi.describeTable(table)
      if (!describe[column]) {
        await qi.addColumn(table, column, spec)
        console.log(`🧩 Added missing column ${table}.${column}`)
        if (afterAdd) await afterAdd()
      }
    } catch (err) {
      // Table may not exist yet on a fresh DB (sync just created it with the
      // column) — safe to ignore.
      console.warn(`⚠️  Could not ensure column ${table}.${column}:`, err)
    }
  }
}

// The publish gate used to live in tbl_products.visibility ENUM('public','private').
// Carry those values into the new `status` column so products an admin had hidden
// stay hidden. Deliberately called only from the afterAdd hook above — it must run
// on the single boot that creates `status`, never again, or it would overwrite
// every status change an admin has made since.
//
// The old `visibility` column is intentionally left in place rather than dropped:
// nothing reads it any more, and keeping it means this migration loses no data and
// can be reverted by hand. It can be dropped manually once the rollout is settled.
// Products used to carry their purity as free text ("22K Gold"). The carat master
// replaces that, so on the single boot that adds tbl_products.caratId we seed the
// master with one carat per distinct purity already in use and point each product
// at its match. That way the dropdown starts populated with exactly what the shop
// uses and no existing product loses its purity.
//
// `purity` itself is deliberately left in place and kept in sync by the API — it is
// NOT NULL on older databases, and other consumers may still read it.
async function backfillProductCarats(): Promise<void> {
  const describe = await sequelize.getQueryInterface().describeTable('tbl_products')
  // Fresh database — nothing to carry over; the admin fills the master by hand.
  if (!describe.purity) return

  const rows = (await sequelize.query(
    "SELECT DISTINCT purity FROM tbl_products WHERE purity IS NOT NULL AND purity <> ''",
    { type: QueryTypes.SELECT }
  )) as { purity: string }[]
  if (rows.length === 0) return

  let order = 1
  for (const { purity } of rows) {
    const [carat] = await Carat.findOrCreate({
      where: { name: purity },
      defaults: { name: purity, order: order++, active: true, createdAt: new Date() },
    })
    await sequelize.query('UPDATE tbl_products SET caratId = :id WHERE purity = :purity', {
      replacements: { id: carat.get('id') as number, purity },
    })
  }
  console.log(`🔁 Seeded ${rows.length} carat(s) from existing product purity values`)
}

// Categories used to have no explicit order: the customer app listed them by
// name and the admin grid by createdAt. On the single boot that adds
// tbl_categories.sortOrder, seed it from the alphabetical order so the customer
// app keeps showing exactly what it showed yesterday — the admin then changes it
// by dragging rows. Only called from the afterAdd hook: re-running it would wipe
// out an order the admin has since arranged by hand.
async function backfillCategorySortOrder(): Promise<void> {
  const rows = await Category.findAll({ order: [['name', 'ASC']] })
  let position = 1
  for (const row of rows) {
    await row.update({ sortOrder: position++ })
  }
  console.log(`🔁 Seeded sortOrder for ${rows.length} categor(ies) from their names`)
}

async function backfillProductStatus(): Promise<void> {
  const describe = await sequelize.getQueryInterface().describeTable('tbl_products')
  // Fresh databases never had a visibility column — nothing to carry over, and
  // the column default ('live') is already correct.
  if (!describe.visibility) return

  const [affected] = await sequelize.query(
    "UPDATE tbl_products SET status = CASE WHEN visibility = 'private' THEN 'private' ELSE 'live' END"
  )
  console.log(`🔁 Backfilled tbl_products.status from visibility (${JSON.stringify(affected)})`)
}
