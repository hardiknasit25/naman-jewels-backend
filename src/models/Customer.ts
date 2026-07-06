import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn, SESSION_DURATIONS } from './base.js'

// 4.4 Customer (User) Management.
export const Customer = sequelize.define('Customer', {
  id: idColumn,
  companyName: { type: DataTypes.STRING(200), allowNull: false },
  mobileNumber: { type: DataTypes.STRING(30), allowNull: false },
  email: { type: DataTypes.STRING(180), allowNull: false },
  // Set at registration (Mobile + Password login for the customer app).
  // Nullable so admin-created records without a password stay valid.
  passwordHash: { type: DataTypes.STRING(200), allowNull: true },
  address: { type: DataTypes.STRING(500), allowNull: false },
  city: { type: DataTypes.STRING(120), allowNull: false },
  referenceBy: { type: DataTypes.STRING(200), allowNull: true },
  // References CustomerType.id. Null while a registration is pending.
  customerTypeId: { type: DataTypes.INTEGER, allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'blocked', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
  },
  lastLogin: { type: DataTypes.DATE, allowNull: true },
  // Per-customer session length (drives JWT expiry for the customer app).
  sessionDuration: {
    type: DataTypes.ENUM(...SESSION_DURATIONS),
    allowNull: false,
    defaultValue: '1d',
  },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_customers' })
