import { randomUUID } from 'node:crypto'

// Mirrors the frontend's id style: a short prefixed id (e.g. "prd-1a2b3c4d").
// Prefixes keep ids readable and match the seed data's convention.
export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}
