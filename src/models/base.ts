import { DataTypes } from 'sequelize'

// Shared column definitions. Every record has a numeric auto-increment primary
// key and an explicit createdAt.
export const idColumn = {
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true,
}

export const createdAtColumn = {
  type: DataTypes.DATE,
  allowNull: false,
  defaultValue: DataTypes.NOW,
}

// Preset session durations shared by Admin (and Customer) — drives JWT expiry.
export const SESSION_DURATIONS = ['2h', '4h', '12h', '1d', '1w', '1m'] as const
