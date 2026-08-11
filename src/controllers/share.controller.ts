import type { Request } from 'express'
import type { Model } from 'sequelize'
import { asyncHandler } from '../utils/asyncHandler.js'
import { Category, Product } from '../models/index.js'
import { env } from '../config/env.js'

// ---------------------------------------------------------------------------
// Public product share page (GET /p/:sku).
//
// The customer app's WhatsApp inquiry can only carry text — the whatsapp:// deep
// link has no attachment parameter — so the photo has to reach the chat as a
// link that WhatsApp previews. This page is what that link points at: a short,
// branded URL whose Open Graph tags turn the message into a product card with
// the picture, instead of a 60-character /uploads/<hash>.webp path pasted into
// the conversation.
//
// It is necessarily public: WhatsApp's preview crawler carries no auth header,
// so anything behind the customer JWT would render as a bare link. What that
// costs is bounded — live products only, and this schema has no price field at
// all — and the page is marked noindex so it can never reach a search engine.
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escape a database value for HTML. Every interpolation below goes through this:
 * product names and notes are admin-entered free text, and this is the first
 * place in the codebase where such a value is written into markup rather than
 * JSON, so nothing may reach the page unescaped.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!)
}

/**
 * Absolute origin used to build the og:image URL — uploads are stored as
 * API-relative paths, and Open Graph requires an absolute one.
 *
 * PUBLIC_BASE_URL wins when set. Otherwise it's derived from the request, and
 * X-Forwarded-Proto is read first: behind a TLS-terminating proxy req.protocol
 * reports "http", and an http image on an https page is exactly the mismatch a
 * crawler drops. Read here rather than via `app.set('trust proxy')` so this stays
 * local to the share page instead of changing how every other route sees its
 * client.
 */
function originFor(req: Request): string {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/+$/, '')
  const forwarded = String(req.get('x-forwarded-proto') ?? '').split(',')[0]!.trim()
  return `${forwarded || req.protocol}://${req.get('host')}`
}

/**
 * Absolute URL of the product's photo, or null when there isn't one a crawler
 * could fetch. Rows that predate the uploads migration still hold a Base64 data
 * URL — unusable as og:image, so those pages simply render without a picture
 * rather than emitting a tag that resolves to nothing.
 */
function photoUrlFor(product: Model, origin: string): string | null {
  const gallery = product.get('images')
  const primary = product.get('imageUrl') as string | null
  const raw = primary || (Array.isArray(gallery) ? (gallery[0] as string | undefined) : undefined)
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/uploads/')) return `${origin}${raw}`
  return null
}

/** "22K · Gross 42.5 g · Net 38.2 g · Size 16 inch" — the preview card's subtitle. */
function summaryFor(product: Model): string {
  const netWeight = product.get('netWeight') as number | null
  const size = product.get('size') as string | null
  return [
    String(product.get('purity')),
    `Gross ${product.get('grossWeight')} g`,
    netWeight != null ? `Net ${netWeight} g` : null,
    size ? `Size ${size}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')
}

/** The spec table, skipping every field the product doesn't have. */
function specRowsFor(product: Model, categoryName: string | null): [string, string][] {
  const netWeight = product.get('netWeight') as number | null
  const size = product.get('size') as string | null
  const stone = product.get('stoneDetails') as string | null
  return [
    ['Code', String(product.get('sku'))],
    categoryName ? ['Category', categoryName] : null,
    ['Purity', String(product.get('purity'))],
    ['Gross Weight', `${product.get('grossWeight')} g`],
    netWeight != null ? ['Net Weight', `${netWeight} g`] : null,
    size ? ['Size', size] : null,
    stone ? ['Stone', stone] : null,
  ].filter((row): row is [string, string] => row !== null)
}

/** Minimal page shell. Inlined CSS — one request, nothing external to load. */
function renderPage(title: string, body: string, head = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex, nofollow">
${head}
<style>
  :root { color-scheme: light dark; --bg:#faf8f5; --card:#fff; --fg:#1c1917; --muted:#78716c; --line:#e7e5e4; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1c1917; --card:#262220; --fg:#f5f5f4; --muted:#a8a29e; --line:#3a3532; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px; background:var(--bg); color:var(--fg);
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { max-width:420px; margin:0 auto; background:var(--card); border:1px solid var(--line);
          border-radius:16px; overflow:hidden; }
  .photo { display:block; width:100%; aspect-ratio:1; object-fit:cover; background:var(--bg); }
  .body { padding:20px; }
  h1 { margin:0 0 4px; font-size:20px; font-weight:600; }
  .summary { margin:0 0 16px; color:var(--muted); font-size:14px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:8px 0; border-top:1px solid var(--line); vertical-align:top; }
  th { font-weight:500; color:var(--muted); width:42%; }
  .notes { margin:16px 0 0; font-size:14px; line-height:1.5; }
  footer { max-width:420px; margin:16px auto 0; text-align:center; color:var(--muted); font-size:13px; }
</style>
</head>
<body>
${body}
<footer>Naman Jewels</footer>
</body>
</html>
`
}

/**
 * GET /p/:sku — the shared product card.
 *
 * Matched on SKU rather than id so the link reads as the code the shop already
 * uses. `status: 'live'` is part of the lookup, so a private product is a 404
 * and is indistinguishable from one that never existed — the same shape as
 * getProduct in the customer controller.
 */
export const productSharePage = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    where: { sku: req.params.sku, status: 'live' },
  })

  if (!product) {
    res
      .status(404)
      .type('html')
      .send(
        renderPage(
          'Product not available',
          '<div class="card"><div class="body"><h1>Product not available</h1>' +
            '<p class="summary">This item is no longer listed.</p></div></div>'
        )
      )
    return
  }

  const origin = originFor(req)
  const name = String(product.get('name'))
  const summary = summaryFor(product)
  const photo = photoUrlFor(product, origin)

  const category = await Category.findByPk(product.get('categoryId') as number)
  const categoryName = category ? String(category.get('name')) : null
  const notes = product.get('notes') as string | null

  // og:* is what WhatsApp reads to build the preview card; twitter:card makes the
  // same page preview correctly if the link is ever pasted somewhere else.
  const head = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Naman Jewels">`,
    `<meta property="og:title" content="${escapeHtml(name)}">`,
    `<meta property="og:description" content="${escapeHtml(summary)}">`,
    `<meta property="og:url" content="${escapeHtml(`${origin}/p/${encodeURIComponent(String(product.get('sku')))}`)}">`,
    photo ? `<meta property="og:image" content="${escapeHtml(photo)}">` : null,
    photo ? `<meta property="og:image:alt" content="${escapeHtml(name)}">` : null,
    `<meta name="twitter:card" content="${photo ? 'summary_large_image' : 'summary'}">`,
  ]
    .filter((tag): tag is string => tag !== null)
    .join('\n')

  const rows = specRowsFor(product, categoryName)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('\n')

  const body = `<div class="card">
${photo ? `<img class="photo" src="${escapeHtml(photo)}" alt="${escapeHtml(name)}">` : ''}
<div class="body">
<h1>${escapeHtml(name)}</h1>
<p class="summary">${escapeHtml(summary)}</p>
<table>
${rows}
</table>
${notes ? `<p class="notes">${escapeHtml(notes)}</p>` : ''}
</div>
</div>`

  // Short cache: the page is generated per request, but WhatsApp re-fetches a
  // shared link often enough that a few minutes of caching is worth having.
  res.set('Cache-Control', 'public, max-age=300')
  res.type('html').send(renderPage(`${name} — Naman Jewels`, body, head))
})
