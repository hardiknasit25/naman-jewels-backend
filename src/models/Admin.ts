import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn, SESSION_DURATIONS } from './base.js'

// Admin accounts that sign in to this panel. Each admin has its own
// sessionDuration, so the issued JWT's expiry differs per user.
export const Admin = sequelize.define('Admin', {
  id: idColumn,
  name: { type: DataTypes.STRING(160), allowNull: false },
  email: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(200), allowNull: false },
  mobile: { type: DataTypes.STRING(30), allowNull: true },
  sessionDuration: {
    type: DataTypes.ENUM(...SESSION_DURATIONS),
    allowNull: false,
    defaultValue: '1d',
  },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_users' })
