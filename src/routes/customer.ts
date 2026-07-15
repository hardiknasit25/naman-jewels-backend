import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { authenticateCustomer } from '../middleware/customerAuth.js'
import * as schemas from '../validators/schemas.js'
import * as c from '../controllers/customer.controller.js'

// The customer-app API, mounted at /api/customer. Kept in its own router (rather
// than added to api.ts) because api.ts applies the ADMIN auth gate to everything
// below its `apiRouter.use(authenticate)` line — these routes need the customer
// gate instead, and register/login need no gate at all.
export const customerRouter = Router()

// ----- Public --------------------------------------------------------------
customerRouter.post('/auth/register', validate(schemas.customerRegister), c.register)
customerRouter.post('/auth/login', validate(schemas.customerLogin), c.login)

// ----- Everything below requires a valid customer JWT ----------------------
customerRouter.use(authenticateCustomer)

customerRouter.post('/auth/logout', c.logout)
customerRouter.get('/auth/me', c.me)

customerRouter.get('/products', c.listProducts)
customerRouter.get('/products/:id', c.getProduct)

customerRouter.get('/categories', c.listCategories)
customerRouter.get('/customer-types', c.listCustomerTypes)
customerRouter.get('/banners', c.listBanners)

customerRouter.get('/static-pages', c.listStaticPages)
customerRouter.get('/static-pages/:id', c.getStaticPage)

customerRouter.get('/inquiries', c.listInquiries)
customerRouter.post('/inquiries', validate(schemas.customerInquiryCreate), c.createInquiry)
