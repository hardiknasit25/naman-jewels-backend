import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idColumn, createdAtColumn } from './base.js'

// Carat master — the configurable list of metal purities (24K, 22K, 18K, …) a
// product can be tagged with. Replaces the free-text `purity` field on Product:
// products now reference a carat by id, and the old text column is kept in sync
// server-side for backward compatibility (see routes/api.ts).
export const Carat = sequelize.define('Carat', {
  id: idColumn,
  // Display label shown in the admin panel and the customer app, e.g. "22K Gold".
  name: { type: DataTypes.STRING(120), allowNull: false },
  // Optional fineness / hallmark value that goes with the carat, e.g. "916".
  purity: { type: DataTypes.STRING(120), allowNull: true },
  // Sort position in dropdowns and the master grid. Lower shows first.
  order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  description: { type: DataTypes.STRING(500), allowNull: true },
  // Retired carats stay on old products but drop out of the "add product" picker.
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: createdAtColumn,
}, { tableName: 'tbl_carats' })
