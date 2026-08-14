// Applies migrations/*.sql in filename order. Idempotent: every migration
// uses IF NOT EXISTS, so re-running is safe.
// Usage: npm run db:migrate  (DATABASE_URL must be set)
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const client = new Client({ connectionString: url })
  await client.connect()

  const dir = join(__dirname, '..', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8')
    await client.query(sql)
    console.log(`applied ${file}`)
  }
  await client.end()
  console.log('migrations complete')
}

main().catch((err) => {
  console.error('migration failed:', err.message)
  process.exit(1)
})
