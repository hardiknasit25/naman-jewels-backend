import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// 4.8 App Content Management — home hero banners / images.
export const Banner = sequelize.define('Banner', {
  id: idColumn,
  title: { type: DataTypes.STRING(200), allowNull: false },
  // Base64 data URL (or remote URL) of the banner image.
  imageUrl: { type: DataTypes.TEXT('long'), allowNull: false },
  linkUrl: { type: DataTypes.STRING(500), allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_banners' })
