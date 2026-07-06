import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// 4.5 Customer Types Management — configurable tiers with a hierarchy order.
export const CustomerType = sequelize.define('CustomerType', {
  id: idColumn,
  name: { type: DataTypes.STRING(120), allowNull: false },
  order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  description: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_customer_types' })
