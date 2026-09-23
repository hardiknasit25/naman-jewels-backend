import { z } from 'zod'

const SESSION_DURATION = z.enum(['2h', '4h', '12h', '1d', '1w', '1m'])

// ----- Auth ----------------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

// Update the signed-in admin's own account details (Profile page).
export const profileUpdate = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  mobile: z.string().min(7, 'Enter a valid mobile number').optional(),
  sessionDuration: SESSION_DURATION.optional(),
})

// Change the signed-in admin's password (Profile page).
export const changePassword = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

// ----- Customer app auth ---------------------------------------------------
// The customer app signs in with mobile + password (not email like the admin panel).
export const customerLogin = z.object({
  mobileNumber: z.string().min(1, 'Mobile number is required'),
  password: z.string().min(1, 'Password is required'),
  // Stable per-install id from the app; lets the same device sign in again.
  deviceId: z.string().max(64).optional(),
})

// Self-registration from the app. The customer never chooses their own tier or
// status — both are assigned by an admin on approval, so those keys are absent
// here on purpose (Zod strips them if a client sends them anyway). Email,
// address and reference-by are no longer collected at registration.
export const customerRegister = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  mobileNumber: z.string().min(7, 'Enter a valid mobile number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  city: z.string().min(1, 'City is required'),
})

// An inquiry raised from the app. customerId is taken from the JWT, never the
// body, so a customer cannot file an inquiry as someone else.
export const customerInquiryCreate = z.object({
  productId: z.number().int().positive('Product is required'),
  quantity: z.number().int().positive('Enter a valid quantity'),
  remark: z.string().max(500).optional(),
})

// ----- Customer Types (4.5) ------------------------------------------------
export const customerTypeCreate = z.object({
  name: z.string().min(1, 'Name is required'),
  order: z.number().int().min(1, 'Order must be 1 or more'),
  description: z.string().optional(),
})
export const customerTypeUpdate = customerTypeCreate.partial()

// ----- Customers (4.4) -----------------------------------------------------
// Email, address and reference-by are no longer collected here either — kept
// out so admin-created/updated records stay consistent with self-registration.
export const customerCreate = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  mobileNumber: z.string().min(1, 'Mobile number is required'),
  // Set during self-registration; optional for admin-created records.
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  city: z.string().min(1, 'City is required'),
  customerTypeId: z.number().int().nullable().optional(),
  status: z.enum(['pending', 'active', 'blocked', 'rejected']).optional(),
  lastLogin: z.string().nullable().optional(),
  // Set by the admin "Force Logout" action to end the customer's live session.
  sessionInvalidatedAt: z.string().nullable().optional(),
  sessionDuration: SESSION_DURATION.optional(),
})
export const customerUpdate = customerCreate.partial()

// ----- Categories ----------------------------------------------------------
export const categoryCreate = z.object({
  name: z.string().min(1, 'Name is required'),
  parentId: z.number().int().nullable().optional(),
  description: z.string().optional(),
  // Base64 data URL or remote URL; empty string clears the image.
  imageUrl: z.string().optional(),
  // Display position. Normally left out — the API appends new categories to the
  // end and the admin reorders them by dragging rows (see categoryReorder).
  sortOrder: z.number().int().min(0).optional(),
})
export const categoryUpdate = categoryCreate.partial()

// Body of PATCH /categories/reorder: every category id in its new display order.
export const categoryReorder = z.object({
  ids: z.array(z.number().int()).min(1, 'At least one category id is required'),
})

// ----- Carats --------------------------------------------------------------
// Master list of metal purities (24K, 22K, 916, …) products are tagged with.
export const caratCreate = z.object({
  name: z.string().min(1, 'Name is required'),
  purity: z.string().optional(),
  order: z.number().int().min(1, 'Order must be 1 or more'),
  description: z.string().optional(),
  active: z.boolean().optional(),
})
export const caratUpdate = caratCreate.partial()

// ----- Products (3.5) ------------------------------------------------------
export const productCreate = z.object({
  name: z.string().min(1, 'Name is required'),
  // Trimmed before it reaches the uniqueness check, so " RG-1042" and "RG-1042"
  // can't sit side by side as two "different" codes.
  sku: z.string().trim().min(1, 'SKU is required'),
  categoryId: z.number().int().positive('Category is required'),
  grossWeight: z.number().positive('Enter a valid weight'),
  netWeight: z.number().nullable().optional(),
  // Itemized breakdown of the less (deducted) weight — any number of factor rows.
  // The weight carries the row, so it must be a real positive number; the label is
  // optional, since an unnamed deduction still counts. Display-only; the admin form
  // is what enforces "at least one row".
  lessFactors: z
    .array(
      z.object({
        label: z.string().optional().default(''),
        weight: z.number().positive('Enter a valid factor weight'),
      })
    )
    .nullable()
    .optional(),
  size: z.string().optional(),
  // Carat master reference — the source of truth for purity.
  caratId: z.number().int().positive('Carat is required'),
  // Legacy free-text purity. Optional on the wire: the API derives it from the
  // selected carat, so clients no longer need to send it.
  purity: z.string().optional(),
  stoneDetails: z.string().optional(),
  notes: z.string().optional(),
  // Primary image — Base64 data URL or remote URL; empty string clears the image.
  imageUrl: z.string().optional(),
  // Gallery images (Base64 data URLs or remote URLs) — no fixed limit.
  images: z.array(z.string()).optional(),
  // Publish gate: 'live' shows the product in the customer app, 'private' hides
  // it from every customer regardless of the tier tags below.
  status: z.enum(['live', 'private']).optional(),
  // 2.2 Customer type tiers this product is tagged to. Visibility is cumulative
  // (a tier also sees everything tagged below it), so tagging the lowest tier
  // reaches everyone. Empty means every tier sees it.
  customerTypeIds: z.array(z.number().int().positive()).optional(),
})
export const productUpdate = productCreate.partial()

// ----- Banners (4.8) -------------------------------------------------------
export const bannerCreate = z.object({
  title: z.string().min(1, 'Title is required'),
  imageUrl: z.string().min(1, 'Image is required'),
  linkUrl: z.string().optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(1, 'Order must be 1 or more'),
})
export const bannerUpdate = bannerCreate.partial()

// ----- Static Pages (4.8) --------------------------------------------------
export const staticPageCreate = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
})
export const staticPageUpdate = staticPageCreate.partial()

// ----- Inquiries (4.6) -----------------------------------------------------
export const inquiryCreate = z.object({
  customerId: z.number().int().positive('Customer is required'),
  productId: z.number().int().positive('Product is required'),
  quantity: z.number().int().positive('Enter a valid quantity'),
  remark: z.string().optional(),
  status: z.enum(['New', 'Seen', 'Responded', 'Closed']).optional(),
})
export const inquiryUpdate = inquiryCreate.partial()
