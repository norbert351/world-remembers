// Bootstrap: load env, build the app, listen, shut down gracefully.
import { createApp } from './app'
import { createPool } from './db'

const port = Number(process.env.PORT ?? 3002)
const pool = createPool(process.env.DATABASE_URL)
const app = createApp(pool)

const server = app.listen(port, () => {
  console.log(`world-remembers-api listening on :${port}`)
})

// Graceful shutdown for cloud hosts and Ctrl+C.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`)
  server.close(() => {
    void pool.end().then(() => process.exit(0))
  })
  // hard stop if connections hang
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
