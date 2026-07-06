import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// One row per state-changing action (create/update/delete/login/logout).
export const AuditLog = sequelize.define('AuditLog', {
  id: idColumn,
  adminId: { type: DataTypes.INTEGER, allowNull: true },
  adminEmail: { type: DataTypes.STRING(180), allowNull: true },
  action: { type: DataTypes.STRING(20), allowNull: false },
  entity: { type: DataTypes.STRING(50), allowNull: false },
  entityId: { type: DataTypes.INTEGER, allowNull: true },
  // JSON snapshot of the change (large media fields are redacted before storing).
  changes: { type: DataTypes.TEXT('long'), allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_audit_logs' })
