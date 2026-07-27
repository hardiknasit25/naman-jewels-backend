import type { Order } from 'sequelize'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { audit } from '../services/audit.js'
import { sequelize, Category } from '../models/index.js'

/** GET / list order shared by the admin grid and the customer app. */
export const CATEGORY_ORDER: Order = [
  ['sortOrder', 'ASC'],
  ['name', 'ASC'],
]

/**
 * PATCH /api/categories/reorder — persist the order the admin arranged by
 * dragging rows in the Categories grid.
 *
 * The body carries every category id in its new order; positions are rewritten
 * as 1..n in one transaction so a half-applied order can never be read. Ids the
 * client doesn't know about (someone else added a category mid-drag) keep their
 * old position, which leaves them at the top — harmless, and the next drag
 * settles it.
 */
export const reorderCategories = asyncHandler(async (req, res) => {
  const { ids } = req.body as { ids: number[] }

  if (new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'Duplicate category ids in the requested order')
  }

  const found = await Category.findAll({ where: { id: ids }, attributes: ['id'] })
  if (found.length !== ids.length) {
    throw new HttpError(400, 'One or more categories no longer exist')
  }

  await sequelize.transaction(async (transaction) => {
    for (const [index, id] of ids.entries()) {
      await Category.update({ sortOrder: index + 1 }, { where: { id }, transaction })
    }
  })

  await audit(req, 'update', 'Category', null, { reordered: ids })

  // Return the fresh list so the client can drop it straight into its cache.
  const rows = await Category.findAll({ order: CATEGORY_ORDER })
  res.json(rows)
})

/**
 * New categories land at the end of the manual order instead of position 0,
 * where they would silently jump to the top of the customer app. Only applied on
 * insert — an edit must never reshuffle a category the admin has placed.
 */
export const appendCategoryToOrder = async (
  body: Record<string, unknown>,
  mode: 'create' | 'update'
): Promise<Record<string, unknown>> => {
  if (mode !== 'create' || body.sortOrder != null) return body
  const max = Number(await Category.max('sortOrder'))
  return { ...body, sortOrder: (Number.isFinite(max) ? max : 0) + 1 }
}
