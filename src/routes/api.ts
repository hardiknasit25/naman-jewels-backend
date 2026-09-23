import express, { Router } from 'express'
import bcrypt from 'bcryptjs'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { crudRouter } from '../services/crud.js'
import { HttpError } from '../utils/httpError.js'
import * as schemas from '../validators/schemas.js'
import {
  CustomerType,
  Customer,
  Category,
  Carat,
  Product,
  Banner,
  StaticPage,
  Inquiry,
} from '../models/index.js'
import { login, logout, me, updateProfile, changePassword } from '../controllers/auth.controller.js'
import { listSessions, listAudit } from '../controllers/logs.controller.js'
import { uploadImage } from '../controllers/upload.controller.js'
import {
  CATEGORY_ORDER,
  appendCategoryToOrder,
  reorderCategories,
} from '../controllers/category.controller.js'
import { customerRouter } from './customer.js'

export const apiRouter = Router()

// ----- Public --------------------------------------------------------------
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})
apiRouter.post('/auth/login', validate(schemas.loginSchema), login)

// ----- Customer app --------------------------------------------------------
// Mounted BEFORE the admin gate below: this router brings its own customer auth
// (and its register/login must stay public). Moving it below `authenticate`
// would make every customer route demand an admin token.
apiRouter.use('/customer', customerRouter)

// ----- Everything below requires a valid ADMIN JWT -------------------------
apiRouter.use(authenticate)

// ----- Media ---------------------------------------------------------------
// Raw image bytes rather than JSON, so the limit here is a real file size — the
// global express.json() limit doesn't apply to this route.
apiRouter.post(
  '/uploads',
  express.raw({ type: ['image/webp', 'image/jpeg', 'image/png'], limit: '12mb' }),
  uploadImage
)

apiRouter.post('/auth/logout', logout)
apiRouter.get('/auth/me', me)
apiRouter.patch('/auth/profile', validate(schemas.profileUpdate), updateProfile)
apiRouter.post('/auth/change-password', validate(schemas.changePassword), changePassword)

apiRouter.use(
  '/customer-types',
  crudRouter({
    model: CustomerType,
    entity: 'CustomerType',
    createSchema: schemas.customerTypeCreate,
    updateSchema: schemas.customerTypeUpdate,
  })
)

apiRouter.use(
  '/customers',
  crudRouter({
    model: Customer,
    entity: 'Customer',
    createSchema: schemas.customerCreate,
    updateSchema: schemas.customerUpdate,
    // Hash the plaintext password into passwordHash; never persist it raw.
    // A force-logout (sessionInvalidatedAt set) also releases the single-device
    // lock, so the customer can sign in again right away on any device.
    transform: (body) => {
      const { password, ...rest } = body as { password?: string; sessionInvalidatedAt?: string | null }
      const out: Record<string, unknown> = { ...rest }
      if (rest.sessionInvalidatedAt) {
        Object.assign(out, { currentJti: null, activeSessionExpiresAt: null, activeDeviceId: null })
      }
      if (typeof password === 'string' && password.length > 0) {
        out.passwordHash = bcrypt.hashSync(password, 10)
      }
      return out
    },
  })
)

// Declared BEFORE the CRUD router below, whose `PATCH /:id` would otherwise
// swallow "reorder" as an id.
apiRouter.patch(
  '/categories/reorder',
  validate(schemas.categoryReorder),
  reorderCategories
)

apiRouter.use(
  '/categories',
  crudRouter({
    model: Category,
    entity: 'Category',
    createSchema: schemas.categoryCreate,
    updateSchema: schemas.categoryUpdate,
    // Categories are manually ordered by dragging rows in the admin grid.
    order: CATEGORY_ORDER,
    transform: appendCategoryToOrder,
  })
)

apiRouter.use(
  '/carats',
  crudRouter({
    model: Carat,
    entity: 'Carat',
    createSchema: schemas.caratCreate,
    updateSchema: schemas.caratUpdate,
  })
)

apiRouter.use(
  '/products',
  crudRouter({
    model: Product,
    entity: 'Product',
    createSchema: schemas.productCreate,
    updateSchema: schemas.productUpdate,
    // The SKU is the code the shop identifies a piece by, and the public share
    // page (/p/:sku) looks products up by it — two products sharing a code would
    // make that link resolve to whichever row the database returned first.
    unique: { field: 'sku', label: 'Product Code / SKU' },
    // Purity is now driven by the carat master. Mirror the selected carat's name
    // into the legacy `purity` column so it never goes stale and older consumers
    // (plus the NOT NULL constraint on existing databases) keep working. Done here
    // rather than in the client so any API caller gets it right.
    transform: async (body) => {
      const { caratId } = body as { caratId?: number }
      if (caratId == null) return body
      const carat = await Carat.findByPk(caratId)
      if (!carat) throw new HttpError(400, 'Selected carat no longer exists')
      return { ...body, purity: carat.get('name') as string }
    },
  })
)

apiRouter.use(
  '/inquiries',
  crudRouter({
    model: Inquiry,
    entity: 'Inquiry',
    createSchema: schemas.inquiryCreate,
    updateSchema: schemas.inquiryUpdate,
  })
)

apiRouter.use(
  '/banners',
  crudRouter({
    model: Banner,
    entity: 'Banner',
    createSchema: schemas.bannerCreate,
    updateSchema: schemas.bannerUpdate,
  })
)

apiRouter.use(
  '/static-pages',
  crudRouter({
    model: StaticPage,
    entity: 'StaticPage',
    createSchema: schemas.staticPageCreate,
    updateSchema: schemas.staticPageUpdate,
    // Static pages track their own updatedAt on every write.
    transform: (body) => ({ ...body, updatedAt: new Date() }),
  })
)

// ----- Logs ----------------------------------------------------------------
apiRouter.get('/session-logs', listSessions)
apiRouter.get('/audit-logs', listAudit)
