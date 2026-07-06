import { Sequelize } from 'sequelize'
import mysql from 'mysql2/promise'
import { env } from './env.js'

// Single shared Sequelize instance used by every model.
export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  logging: env.DB_LOGGING ? (msg) => console.log(msg) : false,
  define: {
    // We manage createdAt/updatedAt explicitly per model to match the frontend shape.
    timestamps: false,
    freezeTableName: true,
  },
})

// Sequelize connects to an existing database; it won't create one. Ensure the
// target database exists first by connecting to the server without a schema.
export async function ensureDatabase(): Promise<void> {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  })
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await connection.end()
}
