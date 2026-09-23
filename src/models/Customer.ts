import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn, SESSION_DURATIONS } from './base.js'

// 4.4 Customer (User) Management.
export const Customer = sequelize.define('Customer', {
  id: idColumn,
  companyName: { type: DataTypes.STRING(200), allowNull: false },
  mobileNumber: { type: DataTypes.STRING(30), allowNull: false },
  // No longer collected at registration or in the admin form — kept nullable so
  // existing records (and anything set by hand) keep displaying.
  email: { type: DataTypes.STRING(180), allowNull: true },
  // Set at registration (Mobile + Password login for the customer app).
  // Nullable so admin-created records without a password stay valid.
  passwordHash: { type: DataTypes.STRING(200), allowNull: true },
  address: { type: DataTypes.STRING(500), allowNull: true },
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
  // Set when an admin force-logs-out the customer. Any customer-app JWT issued
  // BEFORE this instant is treated as dead by authenticateCustomer, so a live
  // session ends on the customer's next request. Cleared on the next login.
  sessionInvalidatedAt: { type: DataTypes.DATE, allowNull: true },
  // Single-device login: while set, a login attempt is refused (see
  // customer.controller.ts) until this timestamp passes or the customer logs
  // out (both clear it), forcing the account to log out elsewhere first.
  currentJti: { type: DataTypes.STRING(64), allowNull: true },
  activeSessionExpiresAt: { type: DataTypes.DATE, allowNull: true },
  // Install id of the device holding the live session. A login from the SAME
  // device is always allowed (e.g. its logout call never reached the server);
  // only a different device is refused while the session is live.
  activeDeviceId: { type: DataTypes.STRING(64), allowNull: true },
  // Per-customer session length (drives JWT expiry for the customer app).
  sessionDuration: {
    type: DataTypes.ENUM(...SESSION_DURATIONS),
    allowNull: false,
    defaultValue: '1d',
  },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_customers' })
