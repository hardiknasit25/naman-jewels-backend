import express, { type Router } from 'express'
import type { Model, ModelStatic, Order } from 'sequelize'
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
}

// Builds a standard REST router for one entity:
//   GET /  GET /:id  POST /  PATCH /:id  DELETE /:id
// Every mutation writes an audit log entry. Responses mirror the shape the
// frontend repositories expect (full row on create/update, { id } on delete).
export function crudRouter(opts: CrudOptions): Router {
  const { model, entity, createSchema, updateSchema, transform } = opts
  const order: Order = opts.order ?? [['createdAt', 'DESC']]
  const router = express.Router()
  const apply = async (body: Record<string, unknown>, mode: 'create' | 'update') =>
    transform ? await transform(body, mode) : body

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
