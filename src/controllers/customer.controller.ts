import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Op } from 'sequelize'
import { env } from '../config/env.js'
import { Banner, Category, Customer, CustomerType, Inquiry, Product, StaticPage } from '../models/index.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { newId } from '../utils/id.js'
import { audit } from '../services/audit.js'
import { CUSTOMER_AUDIENCE, statusMessage } from '../middleware/customerAuth.js'
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
    companyName: string; mobileNumber: string; email: string
    password: string; address: string; city: string; referenceBy?: string
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
    email: body.email,
    passwordHash: bcrypt.hashSync(body.password, 10),
    address: body.address,
    city: body.city,
    referenceBy: body.referenceBy ?? null,
    customerTypeId: null,
    status: 'pending',
    sessionDuration: '1d',
    createdAt: new Date(),
  })

  await audit(req, 'create', 'Customer', created.get('id') as number,
    { companyName: body.companyName, mobileNumber: body.mobileNumber, email: body.email, status: 'pending' },
    { id: created.get('id') as number, email: body.email })

  // 201 with the pending record — the app shows a "waiting for approval" screen.
  res.status(201).json({ customer: publicCustomer(created) })
})

// POST /api/customer/auth/login — mobile + password. Issues a customer-audience
// JWT whose expiry is the customer's own sessionDuration.
export const login = asyncHandler(async (req, res) => {
  const { mobileNumber, password } = req.body as { mobileNumber: string; password: string }

  const all = await Customer.findAll()
  const target = digits(mobileNumber)
  const customer = all.find((c) => digits(c.get('mobileNumber') as string) === target)

  const hash = customer?.get('passwordHash') as string | null | undefined
  // Same generic message whether the mobile is unknown or the password is wrong —
  // don't reveal which mobile numbers are registered.
  if (!customer || !hash || !bcrypt.compareSync(password, hash)) {
    throw new HttpError(401, 'Invalid mobile number or password', 'invalid')
  }

  // Pending/blocked/rejected accounts get a specific reason so the app can
  // explain what's happening instead of showing "wrong password".
  const status = customer.get('status') as string
  if (status !== 'active') {
    throw new HttpError(403, statusMessage(status), status)
  }

  const sessionDuration = (customer.get('sessionDuration') as string) ?? '1d'
  const id = customer.get('id') as number
  const email = customer.get('email') as string

  const token = jwt.sign({ sub: id, email, jti: newId('cjti') }, env.JWT_SECRET, {
    expiresIn: (DURATION_TO_JWT[sessionDuration] ?? '1d') as jwt.SignOptions['expiresIn'],
    audience: CUSTOMER_AUDIENCE,
  })

  await customer.update({ lastLogin: new Date() })
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
// SessionLog (that table is admin-scoped), so this only records the audit entry;
// the client discards its token.
export const logout = asyncHandler(async (req, res) => {
  const { id, email } = req.customer!
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

// GET /api/customer/products?search=&categoryId=
// One endpoint backs the home feed, category listing, and search — all three are
// the same tier-filtered set with an optional narrowing.
export const listProducts = asyncHandler(async (req, res) => {
  const { search, categoryId } = req.query as { search?: string; categoryId?: string }
  let rows = await visibleProductsFor(req.customer!.customerTypeId)

  if (categoryId) {
    // Include sub-categories, matching the app's previous categoryTreeIds().
    const wanted = new Set(await categoryTreeIds(Number(categoryId)))
    rows = rows.filter((p) => wanted.has(p.get('categoryId') as number))
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
    Category.findAll({ order: [['name', 'ASC']] }),
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
