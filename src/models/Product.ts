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
  // 'public' = visible to customers; 'private' = hidden from the customer app.
  // Defaults to 'public' so existing products stay visible.
  visibility: {
    type: DataTypes.ENUM('public', 'private'),
    allowNull: false,
    defaultValue: 'public',
  },
  // Primary image (kept for backward compatibility / list thumbnails). Mirrors
  // images[0]. Stored as a Base64 data URL (or a remote URL); LONGTEXT holds large images.
  imageUrl: { type: DataTypes.TEXT('long'), allowNull: true },
  // Gallery of up to 5 images (Base64 data URLs or remote URLs) as a JSON array.
  images: { type: DataTypes.JSON, allowNull: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_products' })
