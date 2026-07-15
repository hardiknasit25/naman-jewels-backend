import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// 3.5 Product Parameters / Specifications — note: no price/MRP field.
export const Product = sequelize.define('Product', {
  id: idColumn,
  name: { type: DataTypes.STRING(200), allowNull: false },
  sku: { type: DataTypes.STRING(80), allowNull: false },
  categoryId: { type: DataTypes.INTEGER, allowNull: false },
  grossWeight: { type: DataTypes.FLOAT, allowNull: false },
  netWeight: { type: DataTypes.FLOAT, allowNull: true },
  size: { type: DataTypes.STRING(120), allowNull: true },
  purity: { type: DataTypes.STRING(120), allowNull: false },
  stoneDetails: { type: DataTypes.STRING(500), allowNull: true },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  // Publish gate: 'live' = published to the customer app, 'private' = hidden from
  // every customer regardless of tier tags. Supersedes the old
  // visibility ENUM('public','private') column, which is left untouched in the
  // database (its values are backfilled into status once) but no longer read.
  status: {
    type: DataTypes.ENUM('live', 'private'),
    allowNull: false,
    defaultValue: 'live',
  },
  // 2.2 Customer Types — the tiers this product is tagged to, as a JSON array of
  // CustomerType ids. Visibility is cumulative: a customer sees a product tagged
  // to their own tier or to any tier below theirs (see services/productVisibility).
  // Empty/null means every tier sees it, so untagged products stay visible.
  customerTypeIds: { type: DataTypes.JSON, allowNull: true },
  // Primary image (kept for backward compatibility / list thumbnails). Mirrors
  // images[0]. Stored as a Base64 data URL (or a remote URL); LONGTEXT holds large images.
  imageUrl: { type: DataTypes.TEXT('long'), allowNull: true },
  // Gallery of up to 5 images (Base64 data URLs or remote URLs) as a JSON array.
  images: { type: DataTypes.JSON, allowNull: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_products' })
