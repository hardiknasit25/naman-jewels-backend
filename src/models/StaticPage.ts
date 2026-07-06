import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// 4.8 App Content Management — static pages edited via a rich text editor.
export const StaticPage = sequelize.define('StaticPage', {
  id: idColumn,
  title: { type: DataTypes.STRING(200), allowNull: false },
  // Rich HTML content.
  content: { type: DataTypes.TEXT('long'), allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_static_pages' })
