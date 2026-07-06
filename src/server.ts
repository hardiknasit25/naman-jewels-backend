import { env } from './config/env.js'
import { createApp } from './app.js'
import { initModels } from './models/index.js'

async function start() {
  // Connect to MySQL and create the schema/tables if needed.
  await initModels()

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
