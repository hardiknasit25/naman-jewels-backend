import { Router } from 'express'
import bcrypt from 'bcryptjs'
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
import { login, logout, me, updateProfile, changePassword } from '../controllers/auth.controller.js'
import { listSessions, listAudit } from '../controllers/logs.controller.js'
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
    transform: (body) => {
      const { password, ...rest } = body as { password?: string }
      if (typeof password === 'string' && password.length > 0) {
        return { ...rest, passwordHash: bcrypt.hashSync(password, 10) }
      }
      return rest
    },
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
