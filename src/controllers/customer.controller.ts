import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Op } from 'sequelize'
import { env } from '../config/env.js'
import { Banner, Carat, Category, Customer, CustomerType, Inquiry, Product, StaticPage } from '../models/index.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { newId } from '../utils/id.js'
import { audit } from '../services/audit.js'
import { CUSTOMER_AUDIENCE, statusMessage } from '../middleware/customerAuth.js'
import { CATEGORY_ORDER } from './category.controller.js'
import {
  isVisibleToTiers,
  visibleTypeIdsFor,
  type ProductVisibilityFields,
} from '../services/productVisibility.js'

// ---------------------------------------------------------------------------
// The customer-app API. Everything here is scoped to the signed-in customer and
// their tier — unlike the admin CRUD routes, which return unfiltered rows.
//
// Two rules are enforced on every product read, server-side, so the app can
// render whatever it receives without re-checking:
//   1. status must be 'live'
//   2. the product's tier tags must include the customer's tier or one below it
// See services/productVisibility.ts.
// ---------------------------------------------------------------------------

const DURATION_TO_JWT: Record<string, string> = {
  '2h': '2h', '4h': '4h', '12h': '12h', '1d': '1d', '1w': '7d', '1m': '30d',
}

/** Mobile numbers are typed with spaces/dashes/+; compare on digits only. */
function digits(value: string): string {
  return value.replace(/\D/g, '')
}

/** The customer shape returned to the app. Never includes passwordHash. */
function publicCustomer(row: InstanceType<typeof Customer>) {
  return {
    id: row.get('id'),
    companyName: row.get('companyName'),
    mobileNumber: row.get('mobileNumber'),
    email: row.get('email'),
    address: row.get('address'),
    city: row.get('city'),
    referenceBy: row.get('referenceBy'),
    customerTypeId: row.get('customerTypeId'),
    status: row.get('status'),
    lastLogin: row.get('lastLogin'),
    sessionDuration: row.get('sessionDuration'),
    createdAt: row.get('createdAt'),
  }
}

// POST /api/customer/auth/register — self-registration. Always lands as
// 'pending' with no tier; an admin approves and assigns the tier later.
export const register = asyncHandler(async (req, res) => {
  const body = req.body as {
    companyName: string; mobileNumber: string
    password: string; city: string
  }

  // Mobile is the login identifier, so it must be unique. Compare on digits so
  // "98250 12345" can't register alongside "9825012345".
  const existing = await Customer.findAll({ attributes: ['id', 'mobileNumber'] })
  const clash = existing.some((c) => digits(c.get('mobileNumber') as string) === digits(body.mobileNumber))
  if (clash) {
    throw new HttpError(409, 'An account with this mobile number already exists', 'duplicate')
  }

  const created = await Customer.create({
    companyName: body.companyName,
    mobileNumber: body.mobileNumber,
    email: null,
    passwordHash: bcrypt.hashSync(body.password, 10),
    address: null,
    city: body.city,
    referenceBy: null,
    customerTypeId: null,
    status: 'pending',
    sessionDuration: '1d',
    createdAt: new Date(),
  })

  await audit(req, 'create', 'Customer', created.get('id') as number,
    { companyName: body.companyName, mobileNumber: body.mobileNumber, status: 'pending' },
    { id: created.get('id') as number })

  // 201 with the pending record — the app shows a "waiting for approval" screen.
  res.status(201).json({ customer: publicCustomer(created) })
})

// POST /api/customer/auth/login — mobile + password. Issues a customer-audience
// JWT whose expiry is the customer's own sessionDuration.
export const login = asyncHandler(async (req, res) => {
  const { mobileNumber, password, deviceId } = req.body as {
    mobileNumber: string
    password: string
    deviceId?: string
  }

  const all = await Customer.findAll()
  const target = digits(mobileNumber)
  const customer = all.find((c) => digits(c.get('mobileNumber') as string) === target)

  const hash = customer?.get('passwordHash') as string | null | undefined
  // Same generic message whether the mobile is unknown or the password is wrong —
  // don't reveal which mobile numbers are registered.
  if (!customer || !hash || !bcrypt.compareSync(password, hash)) {
    throw new HttpError(401, 'Invalid mobile number or password', 'invalid')
  }

  // Blocked/rejected accounts are refused with a specific reason. Pending accounts
  // are let in with a limited session: they have no tier, so the product API only
  // returns untagged/public products until an admin approves them and assigns a
  // tier. See middleware/customerAuth.ts and services/productVisibility.ts.
  const status = customer.get('status') as string
  if (status === 'blocked' || status === 'rejected') {
    throw new HttpError(403, statusMessage(status), status)
  }

  const id = customer.get('id') as number

  // Single-device login: refuse a login while ANOTHER device still holds a live
  // (not logged-out, not expired) session for this customer. The same device
  // signing in again is allowed — otherwise a logout call that failed to reach
  // the server would lock the customer out of their own phone until expiry.
  const activeSessionExpiresAt = customer.get('activeSessionExpiresAt') as Date | string | null
  const activeDeviceId = customer.get('activeDeviceId') as string | null
  const sessionLive =
    !!activeSessionExpiresAt && new Date(activeSessionExpiresAt).getTime() > Date.now()
  const sameDevice = !!deviceId && !!activeDeviceId && deviceId === activeDeviceId
  if (sessionLive && !sameDevice) {
    throw new HttpError(
      409,
      'This account is already logged in on another device. Please logout from that device first.',
      'device_conflict'
    )
  }

  const sessionDuration = (customer.get('sessionDuration') as string) ?? '1d'
  const email = customer.get('email') as string

  const jti = newId('cjti')
  const token = jwt.sign({ sub: id, email, jti }, env.JWT_SECRET, {
    expiresIn: (DURATION_TO_JWT[sessionDuration] ?? '1d') as jwt.SignOptions['expiresIn'],
    audience: CUSTOMER_AUDIENCE,
  })
  const decoded = jwt.decode(token) as { exp: number }

  // Clear any force-logout stamp: this new token is issued now, so the session is
  // valid again. Without this a same-second re-login could still look invalidated.
  // currentJti + activeSessionExpiresAt mark this device's session as the sole
  // active one, so a login from elsewhere is refused above until this one ends.
  await customer.update({
    lastLogin: new Date(),
    sessionInvalidatedAt: null,
    currentJti: jti,
    activeSessionExpiresAt: new Date(decoded.exp * 1000),
    activeDeviceId: deviceId ?? null,
  })
  await audit(req, 'login', 'Customer', id, null, { id, email })

  res.json({ token, customer: publicCustomer(customer) })
})

// GET /api/customer/auth/me — re-fetch the signed-in customer. The app calls this
// on launch to validate a stored token before trusting it.
export const me = asyncHandler(async (req, res) => {
  const customer = await Customer.findByPk(req.customer!.id)
  if (!customer) throw new HttpError(401, 'Invalid session')
  res.json({ customer: publicCustomer(customer) })
})

// POST /api/customer/auth/logout — customer sessions aren't tracked in
// SessionLog (that table is admin-scoped). Clears the single-device lock so
// another device can log in immediately, then records the audit entry; the
// client discards its token.
export const logout = asyncHandler(async (req, res) => {
  const { id, email } = req.customer!
  await Customer.update(
    { currentJti: null, activeSessionExpiresAt: null, activeDeviceId: null },
    { where: { id } }
  )
  await audit(req, 'logout', 'Customer', id, null, { id, email })
  res.json({ success: true })
})

/**
 * Images are stored as Base64 data URLs, so a product row can be megabytes. List
 * responses therefore omit the `images` gallery and keep only `imageUrl` (the
 * thumbnail the lists actually render) — the gallery is fetched with the single
 * product on the detail screen. Without this, the home feed would ship every
 * gallery image of every product over a phone connection.
 */
const LIST_EXCLUDE = { exclude: ['images'] }

/** Every product this customer may see, newest first. Shared by list + search. */
async function visibleProductsFor(customerTypeId: number | null, lightweight = true) {
  const visibleTypeIds = await visibleTypeIdsFor(customerTypeId)
  const rows = await Product.findAll({
    where: { status: 'live' },
    order: [['createdAt', 'DESC']],
    ...(lightweight ? { attributes: LIST_EXCLUDE } : {}),
  })
  return rows.filter((row) =>
    isVisibleToTiers(row.get({ plain: true }) as ProductVisibilityFields, visibleTypeIds)
  )
}

// GET /api/customer/products?search=&categoryId=&caratId=
// One endpoint backs the home feed, category listing, and search — all three are
// the same tier-filtered set with an optional narrowing.
export const listProducts = asyncHandler(async (req, res) => {
  const { search, categoryId, caratId } = req.query as {
    search?: string; categoryId?: string; caratId?: string
  }
  let rows = await visibleProductsFor(req.customer!.customerTypeId)

  if (categoryId) {
    // Include sub-categories, matching the app's previous categoryTreeIds().
    const wanted = new Set(await categoryTreeIds(Number(categoryId)))
    rows = rows.filter((p) => wanted.has(p.get('categoryId') as number))
  }

  // Carat (purity) chip filter. Applied AFTER the tier gate above, never instead
  // of it — narrowing by carat must not widen what the customer can see.
  const carat = Number(caratId)
  if (caratId && Number.isInteger(carat) && carat > 0) {
    rows = rows.filter((p) => (p.get('caratId') as number | null) === carat)
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase()
    rows = rows.filter(
      (p) =>
        String(p.get('name')).toLowerCase().includes(q) ||
        String(p.get('sku')).toLowerCase().includes(q)
    )
  }

  res.json(rows)
})

// GET /api/customer/products/:id — 404 for anything the customer may not see, so
// a hidden product is indistinguishable from a missing one.
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByPk(req.params.id)
  if (!product) throw new HttpError(404, 'Product not found')

  const visibleTypeIds = await visibleTypeIdsFor(req.customer!.customerTypeId)
  if (!isVisibleToTiers(product.get({ plain: true }) as ProductVisibilityFields, visibleTypeIds)) {
    throw new HttpError(404, 'Product not found')
  }
  res.json(product)
})

/** A category id plus its direct children — mirrors the app's one-level tree. */
async function categoryTreeIds(id: number): Promise<number[]> {
  const subs = await Category.findAll({ where: { parentId: id }, attributes: ['id'] })
  return [id, ...subs.map((c) => c.get('id') as number)]
}

// GET /api/customer/categories — every category with a productCount already
// resolved for this customer's tier. The app used to compute this per row by
// filtering the full product array; over HTTP that was a request per category.
export const listCategories = asyncHandler(async (req, res) => {
  const [categories, products] = await Promise.all([
    // Same order as the admin grid: whatever the admin dragged the rows into.
    Category.findAll({ order: CATEGORY_ORDER }),
    visibleProductsFor(req.customer!.customerTypeId),
  ])

  // Direct count per category id, then roll children up into their parent so a
  // main category reports everything beneath it.
  const direct = new Map<number, number>()
  for (const p of products) {
    const cid = p.get('categoryId') as number
    direct.set(cid, (direct.get(cid) ?? 0) + 1)
  }

  const payload = categories.map((c) => {
    const id = c.get('id') as number
    const childIds = categories
      .filter((other) => (other.get('parentId') as number | null) === id)
      .map((other) => other.get('id') as number)
    const productCount =
      (direct.get(id) ?? 0) + childIds.reduce((sum, cid) => sum + (direct.get(cid) ?? 0), 0)
    return { ...(c.get({ plain: true }) as Record<string, unknown>), productCount }
  })

  res.json(payload)
})

// GET /api/customer/carats?categoryId= — the carat (purity) filter chips.
//
// EVERY active carat in the master is offered, in the admin's display order, so
// the chip row is the same stable set of purities on every product screen rather
// than shifting with whatever happens to be in stock.
//
// productCount is how many products this customer can actually see for that
// carat — counted from the same tier-filtered set the product list uses, scoped
// to categoryId (and its sub-categories) when given, exactly as the product list
// scopes. It is a COUNT ONLY and never hides a chip: a carat whose products are
// all private or above this customer's tier still shows, reporting 0, and tapping
// it lands on the "no products in this purity" empty state. No product is ever
// exposed through this endpoint that the product list wouldn't also return.
export const listCarats = asyncHandler(async (req, res) => {
  const { categoryId } = req.query as { categoryId?: string }

  const [carats, allProducts] = await Promise.all([
    Carat.findAll({
      where: { active: true },
      order: [['order', 'ASC'], ['name', 'ASC']],
    }),
    visibleProductsFor(req.customer!.customerTypeId),
  ])

  let products = allProducts
  if (categoryId) {
    const wanted = new Set(await categoryTreeIds(Number(categoryId)))
    products = products.filter((p) => wanted.has(p.get('categoryId') as number))
  }

  const counts = new Map<number, number>()
  for (const p of products) {
    const id = p.get('caratId') as number | null
    if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const payload = carats.map((c) => ({
    ...(c.get({ plain: true }) as Record<string, unknown>),
    productCount: counts.get(c.get('id') as number) ?? 0,
  }))

  res.json(payload)
})

// GET /api/customer/customer-types — tier names, so the app can label the
// customer's own tier without hardcoding "Gold"/"Platinum".
export const listCustomerTypes = asyncHandler(async (_req, res) => {
  res.json(await CustomerType.findAll({ order: [['order', 'ASC']] }))
})

// GET /api/customer/banners — active only, in display order.
export const listBanners = asyncHandler(async (_req, res) => {
  res.json(await Banner.findAll({ where: { active: true }, order: [['order', 'ASC']] }))
})

// GET /api/customer/static-pages
export const listStaticPages = asyncHandler(async (_req, res) => {
  res.json(await StaticPage.findAll({ order: [['title', 'ASC']] }))
})

// GET /api/customer/static-pages/:id
export const getStaticPage = asyncHandler(async (req, res) => {
  const page = await StaticPage.findByPk(req.params.id)
  if (!page) throw new HttpError(404, 'Page not found')
  res.json(page)
})

// GET /api/customer/inquiries — the customer's own inquiries, newest first, each
// with its product embedded. The app renders product name/SKU/image per row;
// without the embed that was one request per row.
export const listInquiries = asyncHandler(async (req, res) => {
  const rows = await Inquiry.findAll({
    where: { customerId: req.customer!.id },
    order: [['createdAt', 'DESC']],
  })

  const productIds = [...new Set(rows.map((r) => r.get('productId') as number))]
  const products = productIds.length
    ? await Product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: LIST_EXCLUDE })
    : []
  const byId = new Map(products.map((p) => [p.get('id') as number, p.get({ plain: true })]))

  // The product is embedded even if it has since been hidden or retagged — the
  // customer already inquired about it, and blanking the row would be confusing.
  // It's null only if the product was deleted outright.
  res.json(
    rows.map((r) => ({
      ...(r.get({ plain: true }) as Record<string, unknown>),
      product: byId.get(r.get('productId') as number) ?? null,
    }))
  )
})

// POST /api/customer/inquiries — raise an inquiry. customerId comes from the JWT.
export const createInquiry = asyncHandler(async (req, res) => {
  const { productId, quantity, remark } = req.body as {
    productId: number; quantity: number; remark?: string
  }

  // Don't let a customer inquire about a product they can't see — that would leak
  // the existence of higher-tier or unpublished products.
  const product = await Product.findByPk(productId)
  const visibleTypeIds = await visibleTypeIdsFor(req.customer!.customerTypeId)
  if (
    !product ||
    !isVisibleToTiers(product.get({ plain: true }) as ProductVisibilityFields, visibleTypeIds)
  ) {
    throw new HttpError(404, 'Product not found')
  }

  const created = await Inquiry.create({
    customerId: req.customer!.id,
    productId,
    quantity,
    remark: remark ?? null,
    status: 'New',
    createdAt: new Date(),
  })

  await audit(req, 'create', 'Inquiry', created.get('id') as number,
    { productId, quantity, remark },
    { id: req.customer!.id, email: req.customer!.email })

  res.status(201).json({
    ...(created.get({ plain: true }) as Record<string, unknown>),
    product: product.get({ plain: true }),
  })
})
