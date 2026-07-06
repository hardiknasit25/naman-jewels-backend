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
  // Media stored as a Base64 data URL (or a remote URL). LONGTEXT holds large images.
  imageUrl: { type: DataTypes.TEXT('long'), allowNull: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_products' })
