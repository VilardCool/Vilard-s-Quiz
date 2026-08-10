// One-time migration: loads every *.json file from ./public/packs into the
// `packs` table in PostgreSQL, so the existing pack library survives the
// move off the filesystem. Safe to run more than once (upserts by name).
//
// Usage:  node migratePacks.js

const fs = require('fs')
const path = require('path')
const db = require('./db')

const packDir = path.join(__dirname, 'public', 'packs')

async function main() {
  await db.initSchema()

  if (!fs.existsSync(packDir)) {
    console.log(`No ${packDir} directory found — nothing to migrate.`)
    process.exit(0)
  }

  const files = fs.readdirSync(packDir).filter((f) => f.endsWith('.json'))

  if (files.length === 0) {
    console.log('No .json pack files found — nothing to migrate.')
    process.exit(0)
  }

  for (const file of files) {
    const name = file.replace(/\.json$/, '')
    try {
      const content = JSON.parse(fs.readFileSync(path.join(packDir, file), 'utf8'))
      await db.savePack(name, content)
      console.log(`Migrated pack: ${name}`)
    } catch (err) {
      console.error(`Failed to migrate ${file}:`, err.message)
    }
  }

  console.log('Done.')
  await db.pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
