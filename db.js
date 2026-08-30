// db.js — PostgreSQL access layer.
//
// Configure via environment variables:
//   DATABASE_URL=postgres://user:password@host:5432/quiz
// or the standard PG* variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT)
// which `pg` reads automatically if DATABASE_URL is not set.
//
// Set PGSSL=true if your provider requires SSL (e.g. most managed cloud DBs).

// Auto-load a .env file if the optional "dotenv" package is installed.
// If it isn't installed, this is a no-op — you can still set real
// environment variables another way (export, docker-compose, etc).
try {
  require('dotenv').config()
} catch (err) {
  // dotenv not installed — fine, we just rely on real environment variables.
}

const { Pool } = require('pg')

const hasConnectionInfo =
  !!process.env.DATABASE_URL || !!process.env.PGPASSWORD || !!process.env.PGHOST

if (!hasConnectionInfo) {
  console.error(`
PostgreSQL is not configured — no DATABASE_URL and no PG* environment
variables were found, so the driver would try to connect with an empty
password (that's what causes the cryptic "SASL: client password must be
a string" error).

Fix:
  1. Copy .env.example to .env and fill in real values.
  2. Run "npm install dotenv" so .env is picked up automatically
     (this file already tries to load it — you just need the package).
  3. Make sure you're running the command from the project folder that
     actually contains your .env file.

Without dotenv installed, either export the variables yourself before
running the command, e.g.:
  DATABASE_URL=postgres://quiz_user:quiz_password@localhost:5432/quiz node migratePacks.js
`)
}

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
      }
    : {
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
      }
)

pool.on('error', (err) => {
  // A connection sitting idle in the pool died — this is not fatal for the
  // app, just log it. Individual queries handle their own errors.
  console.error('Unexpected PostgreSQL pool error:', err)
})

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS players (
    uuid UUID PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'User',
    picture TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS packs (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS game_results (
    id SERIAL PRIMARY KEY,
    room_name TEXT NOT NULL,
    pack_name TEXT,
    winner_name TEXT,
    winner_score INTEGER,
    finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_game_results_finished_at ON game_results (finished_at DESC);
`

async function initSchema({ retries = 5, delayMs = 2000 } = {}) {
  // A missing config isn't a transient connectivity problem — retrying
  // 5 times with the exact same (empty) credentials won't help, so fail
  // immediately instead of waiting ~10s to say the same thing 5 times.
  if (!hasConnectionInfo) {
    throw new Error('PostgreSQL connection is not configured (see the message printed above).')
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(SCHEMA_SQL)
      console.log('PostgreSQL: schema ready')
      return
    } catch (err) {
      console.error(`PostgreSQL: connection/schema init failed (attempt ${attempt}/${retries}):`, err.message)
      if (attempt === retries) throw err
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

// --- Players -----------------------------------------------------------

// Returns the stored profile for uuid, creating a default row if none exists.
async function getOrCreatePlayer(uuid) {
  const { rows } = await pool.query(
    `INSERT INTO players (uuid, name, picture)
     VALUES ($1, 'User', '')
     ON CONFLICT (uuid) DO UPDATE SET uuid = EXCLUDED.uuid
     RETURNING name, picture`,
    [uuid]
  )
  return rows[0]
}

async function updatePlayerName(uuid, name) {
  await pool.query(
    `UPDATE players SET name = $2, updated_at = now() WHERE uuid = $1`,
    [uuid, name]
  )
}

async function updatePlayerPicture(uuid, picture) {
  await pool.query(
    `UPDATE players SET picture = $2, updated_at = now() WHERE uuid = $1`,
    [uuid, picture]
  )
}

// --- Packs ---------------------------------------------------------------

// Returns an array of pack names available to host.
async function listPacks() {
  const { rows } = await pool.query(`SELECT name FROM packs ORDER BY name ASC`)
  return rows.map((r) => r.name)
}

// Returns [{name, image}] for the pack picker — pulls just the cover image
// out of each pack's JSON via a JSON path instead of loading full content
// (a pack's rounds/questions can be large; the picker only needs the image).
async function listPacksWithImages() {
  const { rows } = await pool.query(
    `SELECT name, content -> name ->> 'image' AS image
     FROM packs ORDER BY name ASC`
  )
  return rows.map((r) => ({ name: r.name, image: r.image || null }))
}

// Returns the pack's JSON content, or null if not found.
async function getPack(name) {
  const { rows } = await pool.query(`SELECT content FROM packs WHERE name = $1`, [name])
  return rows.length ? rows[0].content : null
}

// Creates or overwrites a pack under `name`.
async function savePack(name, content) {
  await pool.query(
    `INSERT INTO packs (name, content)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
    [name, content]
  )
}

// --- Game results ----------------------------------------------------------

async function logGameResult({ roomName, packName, winnerName, winnerScore }) {
  await pool.query(
    `INSERT INTO game_results (room_name, pack_name, winner_name, winner_score)
     VALUES ($1, $2, $3, $4)`,
    [roomName, packName || null, winnerName || null, winnerScore ?? null]
  )
}

async function recentGameResults(limit = 20) {
  const { rows } = await pool.query(
    `SELECT room_name, pack_name, winner_name, winner_score, finished_at
     FROM game_results ORDER BY finished_at DESC LIMIT $1`,
    [limit]
  )
  return rows
}

module.exports = {
  pool,
  initSchema,
  getOrCreatePlayer,
  updatePlayerName,
  updatePlayerPicture,
  listPacks,
  listPacksWithImages,
  getPack,
  savePack,
  logGameResult,
  recentGameResults
}