import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { crudRouter } from '../services/crud.js'
import * as schemas from '../validators/schemas.js'
import {
  CustomerType,
  Customer,
  Category,
  Product,
  Banner,
  StaticPage,
  Inquiry,
} from '../models/index.js'
import { login, logout, me } from '../controllers/auth.controller.js'
import { listSessions, listAudit } from '../controllers/logs.controller.js'

export const apiRouter = Router()

// ----- Public --------------------------------------------------------------
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})
apiRouter.post('/auth/login', validate(schemas.loginSchema), login)

// ----- Everything below requires a valid JWT -------------------------------
apiRouter.use(authenticate)

apiRouter.post('/auth/logout', logout)
apiRouter.get('/auth/me', me)

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
  })
)

apiRouter.use(
  '/categories',
  crudRouter({
    model: Category,
    entity: 'Category',
    createSchema: schemas.categoryCreate,
    updateSchema: schemas.categoryUpdate,
  })
)

apiRouter.use(
  '/products',
  crudRouter({
    model: Product,
    entity: 'Product',
    createSchema: schemas.productCreate,
    updateSchema: schemas.productUpdate,
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
