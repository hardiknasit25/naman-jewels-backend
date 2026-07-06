import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// One row per login. Records who signed in, when, from where, and when the
// session ended (either by logout or token expiry).
export const SessionLog = sequelize.define('SessionLog', {
  id: idColumn,
  adminId: { type: DataTypes.INTEGER, allowNull: true },
  email: { type: DataTypes.STRING(180), allowNull: true },
  // JWT id — lets logout close exactly the matching session.
  jti: { type: DataTypes.STRING(64), allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  userAgent: { type: DataTypes.STRING(500), allowNull: true },
  loginAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  logoutAt: { type: DataTypes.DATE, allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_session_logs' })
