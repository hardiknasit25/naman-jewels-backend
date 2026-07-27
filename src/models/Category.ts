import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

export const Category = sequelize.define('Category', {
  id: idColumn,
  name: { type: DataTypes.STRING(160), allowNull: false },
  // Null = top-level category; otherwise the parent category id (sub-category).
  parentId: { type: DataTypes.INTEGER, allowNull: true },
  description: { type: DataTypes.STRING(500), allowNull: true },
  // Single category image (Base64 data URL or remote URL). LONGTEXT holds large images.
  imageUrl: { type: DataTypes.TEXT('long'), allowNull: true },
  // Display position, set by dragging rows in the admin Categories grid. Lower
  // shows first — in the admin grid, in the pickers, and in the customer app.
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_categories' })
