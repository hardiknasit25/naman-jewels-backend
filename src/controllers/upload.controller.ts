import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { storeImage } from '../services/uploads.js'

/**
 * POST /api/uploads — store one image and return its URL.
 *
 * The body is the raw image bytes, not JSON and not multipart: the admin client
 * already holds a Blob from the crop canvas, so posting it directly avoids both
 * the ~33% Base64 inflation and a multipart parsing dependency. The response is
 * `{ url }`, which is what the caller saves on the product / banner / category.
 */
export const uploadImage = asyncHandler(async (req, res) => {
  const bytes = req.body as unknown

  // express.raw() leaves an empty object behind when the Content-Type doesn't
  // match, so an unparsed body means the client sent the wrong type.
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new HttpError(
      400,
      'Send the raw image bytes with an image/webp, image/jpeg or image/png Content-Type'
    )
  }

  const url = await storeImage(bytes)
  res.status(201).json({ url })
})
