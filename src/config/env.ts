import 'dotenv/config'
import { z } from 'zod'

// Validate and normalise environment variables once, at startup.
const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),

  // Allowed CORS origins for the separate frontend app.
  // "*" allows any origin; otherwise a comma-separated list of exact origins,
  // e.g. "http://localhost:5173,https://admin.namanjewels.com".
  CORS_ORIGIN: z.string().default('*'),

  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  // Default session length for the seeded admin (per-user, drives JWT expiry).
  ADMIN_SESSION_DURATION: z
    .enum(['2h', '4h', '12h', '1d', '1w', '1m'])
    .default('1d'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().default(''),
  DB_LOGGING: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  console.error(`❌ Invalid environment configuration:\n${issues}`)
  process.exit(1)
}

export const env = parsed.data
