import type { Request, Response } from 'express'
import { Carat, Category, Product } from '../models/index.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { audit } from '../services/audit.js'
import type { IntegrationProduct } from '../validators/schemas.js'

// ---------------------------------------------------------------------------
// The shop's desktop software (VB.NET) pushes its product entries here. It knows
// nothing of our ids, so a product is identified by its SKU and its category and
// carat by name. Photos and tags are never sent — the admin adds those later.
// ---------------------------------------------------------------------------

/** Who the audit log records these changes as. */
const DESKTOP_ACTOR = { id: null, email: 'desktop-api' }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A category by name. "Rings" matches a category of that name at any level;
 * "Rings > Bangles" picks the sub-category under that parent, for when two
 * parents share a sub-category name.
 */
async function resolveCategory(input: string): Promise<number> {
  const all = await Category.findAll({ attributes: ['id', 'name', 'parentId'] })
  const [parentName, childName] = input.includes('>')
    ? input.split('>').map((s) => s.trim())
    : [null, input]

  const matches = all.filter((c) => {
    if (!same(c.get('name') as string, childName)) return false
    if (parentName == null) return true
    const parent = all.find((p) => p.get('id') === c.get('parentId'))
    return !!parent && same(parent.get('name') as string, parentName)
  })

  if (matches.length === 1) return matches[0].get('id') as number
  if (matches.length > 1) {
    throw new HttpError(
      400,
      `Category "${input}" matches more than one category. Send it as "Parent > ${childName}".`,
      'category_ambiguous'
    )
  }
  throw new HttpError(400, `Category "${input}" does not exist. Add it in the admin panel first.`, 'category_not_found')
}

/** A carat by its name ("22K") or its fineness ("916"). */
async function resolveCarat(input: string): Promise<{ id: number; name: string }> {
  const all = await Carat.findAll({ attributes: ['id', 'name', 'purity', 'active'] })
  const matches = all.filter(
    (c) => same(c.get('name') as string, input) || same((c.get('purity') as string | null) ?? '', input)
  )
  // Prefer a carat still in use if a retired one shares the name.
  const carat = matches.find((c) => c.get('active')) ?? matches[0]
  if (!carat) {
    throw new HttpError(400, `Carat "${input}" does not exist. Add it in the admin panel first.`, 'carat_not_found')
  }
  return { id: carat.get('id') as number, name: carat.get('name') as string }
}

/** The fields the desktop software is the source of for a product. */
async function productFields(body: IntegrationProduct) {
  const categoryId = await resolveCategory(body.category)
  const carat = await resolveCarat(body.carat)
  const fields: Record<string, unknown> = {
    categoryId,
    caratId: carat.id,
    purity: carat.name,
    grossWeight: body.grossWeight,
  }
  // Fields the request leaves out are left as they are; "" or null clears them.
  if (body.name !== undefined) fields.name = body.name
  if (body.netWeight !== undefined) fields.netWeight = body.netWeight
  if (body.size !== undefined) fields.size = body.size
  if (body.stoneDetails !== undefined) fields.stoneDetails = body.stoneDetails
  if (body.notes !== undefined) fields.notes = body.notes
  if (body.lessFactors !== undefined) fields.lessFactors = body.lessFactors
  return fields
}

/** The reply shape: enough for the desktop software to log what happened. */
function summary(product: InstanceType<typeof Product>) {
  return {
    id: product.get('id'),
    sku: product.get('sku'),
    name: product.get('name'),
    status: product.get('soldAt') ? 'sold' : product.get('status'),
  }
}

// GET /api/integration/ping — lets the desktop developer check the URL and key.
export const ping = (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'API key accepted' })
}

// POST /api/integration/products — add a product, or update it if the SKU exists.
// Keyed on SKU so a request retried after a network error never makes a second
// copy. New products start 'private': they only reach the customer app once the
// admin has added photos and set them live.
export const upsertProduct = asyncHandler(async (req, res) => {
  const body = req.body as IntegrationProduct
  const fields = await productFields(body)
  const existing = await Product.findOne({ where: { sku: body.sku } })

  if (existing) {
    await existing.update(fields)
    await audit(req, 'update', 'Product', existing.get('id') as number, { sku: body.sku, ...fields }, DESKTOP_ACTOR)
    res.json({ result: 'updated', product: summary(existing) })
    return
  }

  const category = await Category.findByPk(fields.categoryId as number)
  const created = await Product.create({
    // Unnamed pieces take their category's name, as in the admin form.
    name: (fields.name as string | null) || (category?.get('name') as string),
    netWeight: null,
    size: null,
    stoneDetails: null,
    notes: null,
    lessFactors: null,
    ...fields,
    sku: body.sku,
    status: 'private',
    customerTypeIds: [],
    images: [],
    tags: [],
    createdAt: new Date(),
  })
  await audit(req, 'create', 'Product', created.get('id') as number, { sku: body.sku, ...fields }, DESKTOP_ACTOR)
  res.status(201).json({ result: 'created', product: summary(created) })
})

// POST /api/integration/products/:sku/sold — the piece was sold at the shop. It
// is hidden from every customer rather than deleted, so inquiries that point at
// it keep their details. Sending it again is harmless.
export const markSold = asyncHandler(async (req, res) => {
  const sku = String(req.params.sku).trim()
  const product = await Product.findOne({ where: { sku } })
  if (!product) throw new HttpError(404, `No product with sku "${sku}"`, 'not_found')

  if (!product.get('soldAt')) {
    await product.update({ status: 'private', soldAt: new Date() })
    await audit(req, 'update', 'Product', product.get('id') as number, { sku, status: 'sold' }, DESKTOP_ACTOR)
  }
  res.json({ result: 'sold', product: summary(product), soldAt: product.get('soldAt') })
})
