import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

export const Category = sequelize.define('Category', {
  id: idColumn,
  name: { type: DataTypes.STRING(160), allowNull: false },
  // Null = top-level category; otherwise the parent category id (sub-category).
  parentId: { type: DataTypes.INTEGER, allowNull: true },
  description: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_categories' })
