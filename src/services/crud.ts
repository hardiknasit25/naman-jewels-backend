import express, { type Router } from 'express'
import { Op, type Model, type ModelStatic, type Order, type WhereOptions } from 'sequelize'
import type { ZodType } from 'zod'
import { asyncHandler } from '../utils/asyncHandler.js'
import { validate } from '../middleware/validate.js'
import { HttpError } from '../utils/httpError.js'
import { audit } from './audit.js'

interface CrudOptions {
  model: ModelStatic<Model>
  /** Human label used in audit logs, e.g. "Product". */
  entity: string
  createSchema: ZodType
  updateSchema: ZodType
  /**
   * Sort applied to GET /. Defaults to newest first, which is what every grid
   * expected before manually ordered entities (categories) came along.
   */
  order?: Order
  /**
   * Optionally transform the validated body before create/update (e.g. stamp
   * updatedAt, hash a password). May be async when the transform needs to read
   * another table — e.g. products resolving the carat name into `purity`.
   * `mode` lets a transform apply only on insert (e.g. appending a new row to
   * the end of a manual sort order without touching it on later edits).
   */
  transform?: (
    body: Record<string, unknown>,
    mode: 'create' | 'update'
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  /**
   * A column whose value must not repeat across rows (e.g. a product's SKU).
   * Checked on create, and on update against every row except the one being
   * edited, so re-saving a record with its own value is always allowed. A clash
   * is a 409 carrying `code: 'duplicate'` and a message naming `label`.
   *
   * A PATCH that doesn't carry the field is left alone — partial updates that
   * touch other columns must keep working.
   */
  unique?: { field: string; label: string }
}

// Builds a standard REST router for one entity:
//   GET /  GET /:id  POST /  PATCH /:id  DELETE /:id
// Every mutation writes an audit log entry. Responses mirror the shape the
// frontend repositories expect (full row on create/update, { id } on delete).
export function crudRouter(opts: CrudOptions): Router {
  const { model, entity, createSchema, updateSchema, transform, unique } = opts
  const order: Order = opts.order ?? [['createdAt', 'DESC']]
  const router = express.Router()
  const apply = async (body: Record<string, unknown>, mode: 'create' | 'update') =>
    transform ? await transform(body, mode) : body

  // Rejects a write whose `unique` column value is already taken. `excludeId` is
  // the row being edited (absent on create), which must not count as a clash
  // against itself. Runs before the insert/update so nothing is written on 409.
  const ensureUnique = async (body: Record<string, unknown>, excludeId?: number) => {
    if (!unique) return
    const value = body[unique.field]
    // Field not part of this (partial) update — nothing to check.
    if (value === undefined || value === null || value === '') return

    const where = { [unique.field]: value } as Record<string, unknown>
    if (excludeId != null) where.id = { [Op.ne]: excludeId }

    const clash = await model.findOne({ where: where as WhereOptions })
    if (clash) {
      throw new HttpError(
        409,
        `${unique.label} "${String(value)}" is already used by another ${entity.toLowerCase()}. Enter a unique ${unique.label}.`,
        'duplicate'
      )
    }
  }

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const rows = await model.findAll({ order })
      res.json(rows)
    })
  )

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const row = await model.findByPk(req.params.id)
      if (!row) throw new HttpError(404, `${entity} not found`)
      res.json(row)
    })
  )

  router.post(
    '/',
    validate(createSchema),
    asyncHandler(async (req, res) => {
      await ensureUnique(req.body)
      const row = await model.create({
        ...(await apply(req.body, 'create')),
        createdAt: new Date(),
      })
      await audit(req, 'create', entity, row.get('id') as number, req.body)
      res.status(201).json(row)
    })
  )

  router.patch(
    '/:id',
    validate(updateSchema),
    asyncHandler(async (req, res) => {
      const row = await model.findByPk(req.params.id)
      if (!row) throw new HttpError(404, `${entity} not found`)
      await ensureUnique(req.body, Number(req.params.id))
      await row.update(await apply(req.body, 'update'))
      await audit(req, 'update', entity, Number(req.params.id), req.body)
      res.json(row)
    })
  )

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const row = await model.findByPk(req.params.id)
      if (!row) throw new HttpError(404, `${entity} not found`)
      await row.destroy()
      await audit(req, 'delete', entity, Number(req.params.id), null)
      res.json({ id: Number(req.params.id) })
    })
  )

  return router
}
