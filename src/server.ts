import { env } from './config/env.js'
import { createApp } from './app.js'
import { initModels } from './models/index.js'
import { seedDatabase } from './seed.js'

async function start() {
  // Connect to MySQL, create the schema/tables if needed, then seed once.
  await initModels()
  await seedDatabase()

  const app = createApp()
  app.listen(env.PORT, () => {
    console.log(`🚀 Backend listening on http://localhost:${env.PORT}`)
    console.log(`   Mode: ${env.NODE_ENV}`)
  })
}

start().catch((err) => {
  console.error('❌ Failed to start server:', err)
  process.exit(1)
})
