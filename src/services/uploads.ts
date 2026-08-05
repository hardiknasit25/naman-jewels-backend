import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env.js'
import { HttpError } from '../utils/httpError.js'

// ---------------------------------------------------------------------------
// Image storage. Uploads are written to disk and the database keeps only a short
// URL, so list responses carry bytes of text instead of megabytes of Base64 and
// the images themselves become independently cacheable by the browser.
// ---------------------------------------------------------------------------

/** Absolute path of the uploads folder. Created on demand. */
export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR)

/** URL path the uploads folder is served under (see app.ts). */
export const UPLOAD_URL_PREFIX = '/uploads'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Identify an image by its magic bytes rather than by a declared Content-Type or
 * data-URL prefix — the header is client-supplied and a mislabelled file would
 * otherwise be saved under an extension that doesn't match its contents.
 */
export function sniffImageMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png'
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/**
 * Write image bytes to the uploads folder and return the URL to store in the
 * database — relative (`/uploads/…`), so the API can move host or domain without
 * every row pointing at the old one. Clients resolve it against their API origin.
 *
 * The filename is a hash of the contents, which buys three things: re-uploading
 * the same image reuses one file instead of duplicating it, the name can never
 * collide, and because a given name's bytes can never change the file is safe to
 * serve with a permanent cache header.
 */
export async function storeImage(bytes: Buffer): Promise<string> {
  const mime = sniffImageMime(bytes)
  const extension = mime ? EXTENSION_BY_MIME[mime] : undefined
  if (!extension) {
    throw new HttpError(415, 'Unsupported image format — use WebP, JPEG or PNG')
  }

  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
  // Sharded a level deep so the folder doesn't grow into one flat directory of
  // tens of thousands of files, which some filesystems and FTP clients handle
  // badly.
  const shard = hash.slice(0, 2)
  const filename = `${hash}.${extension}`

  await mkdir(path.join(UPLOAD_ROOT, shard), { recursive: true })
  await writeFile(path.join(UPLOAD_ROOT, shard, filename), bytes)

  return `${UPLOAD_URL_PREFIX}/${shard}/${filename}`
}

/**
 * Decode a Base64 data URL into raw bytes. Returns null for anything that isn't
 * one — an already-migrated `/uploads/…` path or a remote `https://…` URL — which
 * is what makes the migration safe to run twice.
 */
export function decodeDataUrl(value: string): Buffer | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value.trim())
  if (!match) return null
  const [, , isBase64, payload] = match
  return isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'binary')
}
