import { Router } from 'express'
import { authenticateIntegration } from '../middleware/integrationAuth.js'
import { validate } from '../middleware/validate.js'
import * as schemas from '../validators/schemas.js'
import { markSold, masters, ping, upsertProduct } from '../controllers/integration.controller.js'

// The shop's desktop software. Every route needs the X-API-Key header.
export const integrationRouter = Router()

integrationRouter.use(authenticateIntegration)
integrationRouter.get('/ping', ping)
integrationRouter.get('/masters', masters)
integrationRouter.post('/products', validate(schemas.integrationProduct), upsertProduct)
integrationRouter.post('/products/:sku/sold', markSold)
