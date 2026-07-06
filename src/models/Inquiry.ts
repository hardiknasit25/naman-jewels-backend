import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// 4.6 Inquiry Management.
export const Inquiry = sequelize.define('Inquiry', {
  id: idColumn,
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  remark: { type: DataTypes.STRING(500), allowNull: true },
  status: {
    type: DataTypes.ENUM('New', 'Seen', 'Responded', 'Closed'),
    allowNull: false,
    defaultValue: 'New',
  },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_inquiries' })
