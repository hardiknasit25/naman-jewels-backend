import { Op } from 'sequelize'
import { CustomerType, Product } from '../models/index.js'

// ---------------------------------------------------------------------------
// 2.2 Customer Types (Tiers) — cumulative product visibility.
//
// Every customer is assigned a CustomerType. A customer sees products tagged to
// their own tier AND to every tier below it, where "below" is decided by
// CustomerType.order (lower number = lower tier):
//
//   Public   (order 1) -> products tagged Public
//   Gold     (order 2) -> products tagged Public + Gold
//   Platinum (order 3) -> products tagged Public + Gold + Platinum
//
// Tier names are configurable rows in tbl_customer_types, never hardcoded, so
// the business can add Silver/Diamond/VIP from the dashboard with no code change.
// A product may be tagged to one or more tiers.
//
// Two gates apply, in order:
//   1. Product.status must be 'live'  — 'private' hides it from everyone.
//   2. Product.customerTypeIds must overlap the customer's visible tiers.
//      An empty/missing tag list means "every tier", which keeps products that
//      predate tier tagging visible.
// ---------------------------------------------------------------------------

/** The Product fields these checks read. Works with a plain row or a model instance's values. */
export interface ProductVisibilityFields {
  status?: string | null
  customerTypeIds?: unknown
}

/** Coerce the JSON column into a clean id array — it may be null, a stale shape, or strings. */
export function normalizeTypeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map(Number).filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * Ids of every tier at or below the given customer's tier — i.e. the set of tags
 * whose products this customer is allowed to see.
 *
 * Returns [] for a customer with no tier assigned (a pending registration). That
 * only limits them to untagged products, so callers that must show nothing at all
 * should check the customer's status separately.
 */
export async function visibleTypeIdsFor(customerTypeId: number | null | undefined): Promise<number[]> {
  if (customerTypeId == null) return []

  const own = await CustomerType.findByPk(customerTypeId)
  if (!own) return []

  const rows = await CustomerType.findAll({
    where: { order: { [Op.lte]: own.get('order') as number } },
    attributes: ['id'],
  })
  return rows.map((row) => row.get('id') as number)
}

/**
 * Whether one product is visible to a customer whose reachable tiers are
 * `visibleTypeIds` (from visibleTypeIdsFor). Pure — no queries — so a caller
 * filtering a list resolves the tier set once and reuses it.
 */
export function isVisibleToTiers(
  product: ProductVisibilityFields,
  visibleTypeIds: number[]
): boolean {
  // Rows written before `status` existed default to 'live' at the column level,
  // but tolerate a null here so a hand-inserted row doesn't vanish silently.
  if ((product.status ?? 'live') !== 'live') return false

  const tags = normalizeTypeIds(product.customerTypeIds)
  if (tags.length === 0) return true

  const allowed = new Set(visibleTypeIds)
  return tags.some((id) => allowed.has(id))
}

/**
 * The product feed for one customer: live products tagged to their tier or below,
 * newest first.
 *
 * The tier match is done in JS rather than SQL because customerTypeIds is a JSON
 * column and JSON_CONTAINS support varies across the MySQL/MariaDB versions this
 * deploys to. The `status` gate is pushed into SQL so private rows are never read.
 */
export async function listProductsForCustomer(customerTypeId: number | null | undefined) {
  const visibleTypeIds = await visibleTypeIdsFor(customerTypeId)
  const rows = await Product.findAll({
    where: { status: 'live' },
    order: [['createdAt', 'DESC']],
  })
  return rows.filter((row) =>
    isVisibleToTiers(row.get({ plain: true }) as ProductVisibilityFields, visibleTypeIds)
  )
}
