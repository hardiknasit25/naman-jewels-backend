import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Customer } from '../models/index.js'
import { HttpError } from '../utils/httpError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

/**
 * Payload of a customer-app JWT. `aud: 'customer'` is what separates these tokens
 * from admin ones: both are signed with the same JWT_SECRET, so without an
 * audience claim an admin token would authenticate as a customer with the same
 * numeric id (and vice versa) — different tables, same `sub`. Never remove it.
 */
export interface CustomerJwtPayload {
  sub: number
  email: string
  jti: string
  aud: 'customer'
}

export const CUSTOMER_AUDIENCE = 'customer'

// Verifies the Bearer JWT and attaches the customer to req.customer. Rejects
// tokens that aren't customer-audience, and re-checks account status on every
// request so blocking a customer in the admin panel takes effect immediately
// rather than whenever their token happens to expire.
export const authenticateCustomer = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication required')
  }

  const token = header.slice('Bearer '.length)
  let payload: CustomerJwtPayload
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      audience: CUSTOMER_AUDIENCE,
    }) as unknown as CustomerJwtPayload
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again')
  }

  const customer = await Customer.findByPk(payload.sub)
  if (!customer) throw new HttpError(401, 'Invalid session')

  // A customer blocked/rejected after their token was issued must lose access now.
  // Pending customers keep access but, having no tier (customerTypeId === null),
  // only ever see untagged/public products — visibleTypeIdsFor(null) returns [].
  const status = customer.get('status') as string
  if (status === 'blocked' || status === 'rejected') {
    throw new HttpError(403, statusMessage(status), status)
  }

  req.customer = {
    id: customer.get('id') as number,
    email: customer.get('email') as string,
    companyName: customer.get('companyName') as string,
    customerTypeId: (customer.get('customerTypeId') as number | null) ?? null,
    status,
  }
  next()
})

/** Human-readable reason for a non-active account, shared with the login flow. */
export function statusMessage(status: string): string {
  switch (status) {
    case 'pending':
      return 'Your account is awaiting approval'
    case 'blocked':
      return 'Your account has been blocked'
    case 'rejected':
      return 'Your registration was not approved'
    default:
      return 'Your account is not active'
  }
}
