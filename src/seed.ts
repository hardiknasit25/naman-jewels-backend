import bcrypt from 'bcryptjs'
import { env } from './config/env.js'
import {
  Admin,
  CustomerType,
  Customer,
  Category,
  Product,
  Banner,
  StaticPage,
  Inquiry,
} from './models/index.js'
// Inline SVG thumbnails so the seed has images without any network dependency
// (matches the original frontend seed).
const swatch = (from: string, to: string) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='72' height='72' rx='12' fill='url(%23g)'/><circle cx='36' cy='36' r='15' fill='none' stroke='white' stroke-width='4' opacity='0.9'/></svg>`
const banner = (from: string, to: string) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='320' height='120' fill='url(%23g)'/></svg>`

const d = (iso: string) => new Date(iso)

// Seeds the database once, only when it is empty (no admins yet).
export async function seedDatabase(): Promise<void> {
  const adminCount = await Admin.count()
  if (adminCount > 0) return

  console.log('🌱 Seeding database (first run)...')

  const DEFAULT_PASSWORD = 'admin123'
  await Admin.create({
    name: 'Naman Admin',
    email: 'admin@namanjewels.com',
    passwordHash: bcrypt.hashSync(DEFAULT_PASSWORD, 10),
    mobile: '9825000000',
    sessionDuration: env.ADMIN_SESSION_DURATION,
    createdAt: new Date(),
  })

  // Explicit numeric ids preserve the relationships below; MySQL advances the
  // AUTO_INCREMENT counter past these so new rows get the next free number.
  await CustomerType.bulkCreate([
    { id: 1, name: 'Public', order: 1, description: 'Default tier for newly approved customers', createdAt: d('2025-01-05T10:00:00.000Z') },
    { id: 2, name: 'Gold', order: 2, description: 'Priority customers', createdAt: d('2025-01-05T10:00:00.000Z') },
    { id: 3, name: 'Platinum', order: 3, description: 'Top-tier customers', createdAt: d('2025-01-05T10:00:00.000Z') },
  ])

  await Customer.bulkCreate([
    { id: 1, companyName: 'Shreeji Jewellers', mobileNumber: '9825012345', email: 'shreeji@example.com', address: '12 Zaveri Bazaar', city: 'Mumbai', referenceBy: 'Rakesh Shah', customerTypeId: 3, status: 'active', lastLogin: d('2026-06-30T09:12:00.000Z'), sessionDuration: '1d', createdAt: d('2025-02-10T08:00:00.000Z') },
    { id: 2, companyName: 'Aabha Gold House', mobileNumber: '9714523698', email: 'aabha@example.com', address: '5 MG Road', city: 'Ahmedabad', referenceBy: '', customerTypeId: 2, status: 'active', lastLogin: d('2026-06-28T14:05:00.000Z'), sessionDuration: '12h', createdAt: d('2025-03-15T08:00:00.000Z') },
    { id: 3, companyName: 'Ratna Ornaments', mobileNumber: '9900112233', email: 'ratna@example.com', address: '88 Commercial St', city: 'Bengaluru', referenceBy: 'Aabha Gold House', customerTypeId: 1, status: 'active', lastLogin: d('2026-06-25T11:30:00.000Z'), sessionDuration: '4h', createdAt: d('2025-05-01T08:00:00.000Z') },
    { id: 4, companyName: 'Meena Bangles', mobileNumber: '9822233445', email: 'meena@example.com', address: '3 Laad Bazaar', city: 'Hyderabad', referenceBy: '', customerTypeId: 1, status: 'blocked', lastLogin: d('2026-05-19T16:45:00.000Z'), sessionDuration: '2h', createdAt: d('2025-05-20T08:00:00.000Z') },
    { id: 5, companyName: 'Kohinoor Diamonds', mobileNumber: '9811098110', email: 'kohinoor@example.com', address: '77 Karol Bagh', city: 'Delhi', referenceBy: 'Shreeji Jewellers', customerTypeId: null, status: 'pending', lastLogin: null, sessionDuration: '1d', createdAt: d('2026-06-29T08:00:00.000Z') },
    { id: 6, companyName: 'Sona Chandi Mart', mobileNumber: '9700055660', email: 'sonachandi@example.com', address: '21 Johari Bazaar', city: 'Jaipur', referenceBy: '', customerTypeId: null, status: 'pending', lastLogin: null, sessionDuration: '1d', createdAt: d('2026-07-01T08:00:00.000Z') },
  ])

  await Category.bulkCreate([
    { id: 1, name: 'Rings', parentId: null, description: 'Finger rings', createdAt: d('2025-01-10T08:00:00.000Z') },
    { id: 2, name: 'Necklaces', parentId: null, description: 'Necklaces & chains', createdAt: d('2025-01-10T08:00:00.000Z') },
    { id: 3, name: 'Bangles', parentId: null, description: 'Bangles & bracelets', createdAt: d('2025-01-10T08:00:00.000Z') },
    { id: 4, name: 'Engagement Rings', parentId: 1, description: 'Sub-category of Rings', createdAt: d('2025-01-12T08:00:00.000Z') },
    { id: 5, name: 'Chains', parentId: 2, description: 'Sub-category of Necklaces', createdAt: d('2025-01-12T08:00:00.000Z') },
  ])

  await Product.bulkCreate([
    { id: 1, name: 'Classic Solitaire Ring', sku: 'RG-1042', categoryId: 4, grossWeight: 4.2, netWeight: 3.8, size: 'US 6', purity: '18K Gold', stoneDetails: 'Diamond 0.5ct x1', notes: 'Bridal collection', imageUrl: swatch('%23fde68a', '%23f59e0b'), createdAt: d('2025-02-01T08:00:00.000Z') },
    { id: 2, name: 'Temple Gold Necklace', sku: 'NK-2201', categoryId: 2, grossWeight: 45.6, netWeight: 45.6, size: '18 inch', purity: '22K Gold', stoneDetails: '', notes: 'Festive', imageUrl: swatch('%23fca5a5', '%23e11d48'), createdAt: d('2025-02-05T08:00:00.000Z') },
    { id: 3, name: 'Kada Bangle Pair', sku: 'BG-3310', categoryId: 3, grossWeight: 30.0, netWeight: 28.5, size: '2.6 diameter', purity: '22K Gold', stoneDetails: '', notes: 'Set of 2', imageUrl: swatch('%23a7f3d0', '%2310b981'), createdAt: d('2025-03-01T08:00:00.000Z') },
    { id: 4, name: 'Silver Rope Chain', sku: 'CH-4407', categoryId: 5, grossWeight: 12.3, netWeight: 12.3, size: '20 inch', purity: '925 Silver', stoneDetails: '', notes: '', imageUrl: null, createdAt: d('2025-03-10T08:00:00.000Z') },
    { id: 5, name: 'Platinum Band', sku: 'RG-1088', categoryId: 1, grossWeight: 6.5, netWeight: 6.5, size: 'US 8', purity: 'Platinum 950', stoneDetails: '', notes: 'Unisex', imageUrl: null, createdAt: d('2025-04-02T08:00:00.000Z') },
  ])

  await Banner.bulkCreate([
    { id: 1, title: 'Festive Gold Collection', imageUrl: banner('%236d28d9', '%234f46e5'), linkUrl: '/products', active: true, order: 1, createdAt: d('2025-06-01T08:00:00.000Z') },
    { id: 2, title: 'Bridal Diamonds', imageUrl: banner('%23e11d48', '%23f59e0b'), linkUrl: '/products', active: true, order: 2, createdAt: d('2025-06-05T08:00:00.000Z') },
    { id: 3, title: 'Silver Everyday', imageUrl: banner('%230f766e', '%2310b981'), linkUrl: '', active: false, order: 3, createdAt: d('2025-06-10T08:00:00.000Z') },
  ])

  await StaticPage.bulkCreate([
    { id: 1, title: 'Contact Us', content: "<h2>Contact Us</h2><p>Reach the Naman Jewels team for any queries.</p><ul><li><strong>Phone:</strong> +91 98250 00000</li><li><strong>Email:</strong> support@namanjewels.com</li><li><strong>Address:</strong> 12 Zaveri Bazaar, Mumbai</li></ul>", updatedAt: d('2025-06-01T08:00:00.000Z'), createdAt: d('2025-01-01T08:00:00.000Z') },
    { id: 2, title: 'Privacy Policy', content: '<h2>Privacy Policy</h2><p>We respect your privacy. This policy explains how we collect and use your information.</p><p>We only collect data required to process your inquiries and improve our service.</p>', updatedAt: d('2025-06-01T08:00:00.000Z'), createdAt: d('2025-01-01T08:00:00.000Z') },
    { id: 3, title: 'Terms & Conditions', content: '<h2>Terms &amp; Conditions</h2><p>By using this application you agree to the following terms.</p><ol><li>Products are shown for reference and availability may vary.</li><li>Prices are shared on inquiry.</li></ol>', updatedAt: d('2025-06-01T08:00:00.000Z'), createdAt: d('2025-01-01T08:00:00.000Z') },
  ])

  await Inquiry.bulkCreate([
    { id: 1, customerId: 1, productId: 1, quantity: 2, remark: 'Need in US 7 as well', status: 'New', createdAt: d('2026-06-30T10:15:00.000Z') },
    { id: 2, customerId: 2, productId: 2, quantity: 1, remark: 'Festive delivery timeline?', status: 'Seen', createdAt: d('2026-06-29T12:40:00.000Z') },
    { id: 3, customerId: 3, productId: 3, quantity: 5, remark: 'Bulk order for store', status: 'Responded', createdAt: d('2026-06-28T09:05:00.000Z') },
    { id: 4, customerId: 1, productId: 5, quantity: 1, remark: '', status: 'Closed', createdAt: d('2026-06-20T15:20:00.000Z') },
    { id: 5, customerId: 2, productId: 4, quantity: 3, remark: 'Silver only', status: 'New', createdAt: d('2026-07-01T08:30:00.000Z') },
  ])

  console.log(`✅ Seed complete. Admin login: admin@namanjewels.com / ${DEFAULT_PASSWORD}`)
}
