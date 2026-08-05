import { sequelize } from '../config/database.js'
import { Product, Banner, Category } from '../models/index.js'
import { decodeDataUrl, storeImage, UPLOAD_ROOT } from '../services/uploads.js'

// ---------------------------------------------------------------------------
// One-time migration: Base64 data URLs in the database -> files on disk.
//
//   npm run migrate:images            (writes)
//   npm run migrate:images -- --dry   (reports, changes nothing)
//
// Safe to re-run. Only values that actually start with `data:` are touched, so a
// second pass over already-migrated rows is a no-op — which also means it can be
// run again after the fact to catch anything written by an older client.
//
// The image bytes are written exactly as they were stored. Decoding Base64 is
// lossless, so nothing is re-encoded or degraded here; only new uploads get the
// smaller WebP treatment, from the admin's crop canvas.
// ---------------------------------------------------------------------------

const dryRun = process.argv.includes('--dry')

interface Stats {
  converted: number
  skipped: number
  failed: number
}

const stats: Stats = { converted: 0, skipped: 0, failed: 0 }

/**
 * Convert one stored value. Returns the new URL, or null when the value needs no
 * work (already a URL, empty, or unreadable).
 */
async function convert(value: unknown, label: string): Promise<string | null> {
  if (typeof value !== 'string' || value.length === 0) return null

  const bytes = decodeDataUrl(value)
  if (!bytes) {
    // Already a `/uploads/…` path or a remote URL.
    stats.skipped += 1
    return null
  }

  if (dryRun) {
    stats.converted += 1
    console.log(`  would convert ${label} (${(bytes.length / 1024).toFixed(0)} KB)`)
    return null
  }

  try {
    const url = await storeImage(bytes)
    stats.converted += 1
    console.log(`  ${label} -> ${url} (${(bytes.length / 1024).toFixed(0)} KB)`)
    return url
  } catch (err) {
    stats.failed += 1
    console.error(`  ✖ ${label}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** Products carry both a primary `imageUrl` and an `images` gallery array. */
async function migrateProducts(): Promise<void> {
  const rows = await Product.findAll()
  console.log(`\nProducts (${rows.length})`)

  for (const row of rows) {
    const id = row.get('id')
    const patch: Record<string, unknown> = {}

    const primary = await convert(row.get('imageUrl'), `product ${id} imageUrl`)
    if (primary) patch.imageUrl = primary

    const gallery = row.get('images')
    if (Array.isArray(gallery) && gallery.length > 0) {
      const converted = await Promise.all(
        gallery.map(async (image, i) => {
          const url = await convert(image, `product ${id} images[${i}]`)
          // Keep the original when it needs no work, so the array never loses an
          // entry or reorders.
          return url ?? (typeof image === 'string' ? image : null)
        })
      )
      const kept = converted.filter((url): url is string => typeof url === 'string')
      if (kept.some((url, i) => url !== gallery[i]) || kept.length !== gallery.length) {
        patch.images = kept
      }
    }

    if (!dryRun && Object.keys(patch).length > 0) await row.update(patch)
  }
}

/** Banners and categories each have a single `imageUrl`. */
async function migrateSingleColumn(
  model: typeof Banner | typeof Category,
  entity: string
): Promise<void> {
  const rows = await model.findAll()
  console.log(`\n${entity} (${rows.length})`)

  for (const row of rows) {
    const url = await convert(row.get('imageUrl'), `${entity} ${row.get('id')} imageUrl`)
    if (url && !dryRun) await row.update({ imageUrl: url })
  }
}

async function main(): Promise<void> {
  console.log(dryRun ? '— DRY RUN, nothing will be written —' : `Writing to ${UPLOAD_ROOT}`)

  // Deliberately not initModels(): that syncs and alters the schema, which a
  // data migration has no business doing — least of all on a dry run. The tables
  // already exist by the time this is worth running.
  await sequelize.authenticate()

  await migrateProducts()
  await migrateSingleColumn(Banner, 'Banners')
  await migrateSingleColumn(Category, 'Categories')

  console.log(
    `\nDone. ${stats.converted} converted, ${stats.skipped} already URLs, ${stats.failed} failed.`
  )
  if (stats.failed > 0) {
    console.log('Failed rows kept their existing value — nothing was lost.')
  }
  await sequelize.close()
}

main().catch(async (err) => {
  console.error('Migration failed:', err)
  await sequelize.close()
  process.exit(1)
})
