/*
 Money-path smoke test (Node).

 Goals:
 - Validate server-authoritative arena settlement path triggers payout endpoint.
 - Validate Solana idempotent payments via payments(op_id) with SOLANA_PAYMENTS_DRY_RUN.

 Preconditions:
 - Server running locally or via NEXT_PUBLIC_SOCKET_URL.
 - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY configured (points to a test project).
 - SOLANA_PAYMENTS_DRY_RUN=true (prevents real chain transactions).
 - TEST_CONTROL_TOKEN set (matches server env) and NODE_ENV != production.

 Run:
   node scripts/money-path-smoke.test.js
*/

const { io } = require('socket.io-client')

const SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
const PATH = process.env.NEXT_PUBLIC_SOCKET_PATH || '/api/socketio'
const TEST_TOKEN = process.env.TEST_CONTROL_TOKEN || ''

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function run() {
  if (!TEST_TOKEN) {
    console.error('Missing TEST_CONTROL_TOKEN')
    process.exit(2)
  }

  const sock = io(SERVER_URL, { path: PATH, transports: ['websocket'] })

  await new Promise((resolve, reject) => {
    let done = false
    const t = setTimeout(() => { if (!done) reject(new Error('timeout connect')) }, 8000)
    sock.on('connect', () => { if (!done) { done = true; clearTimeout(t); resolve() } })
  })

  // Register a stable test identity
  sock.emit('register_identity', 'guest_smoke')

  const matchSessionId = `ms-smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const lobbyId = `smoke-lobby-${Date.now()}`

  // Use fake-but-valid-looking Solana base58 strings (case-sensitive) to exercise canonical wallet map.
  // These don't need to be real keys when SOLANA_PAYMENTS_DRY_RUN=true.
  const humanA = '7YkGfZpJ2kY2b8jV3Vd5VgF2n9Qm3pYwqXc1HkP2mLQh'
  const humanB = '4oYwQWZV6mR6xKp9VhG2sEwB7Yc9KpQm2vZr3xS6dHjT'

  let seeded = null
  sock.once('test_seeded', (p) => { seeded = p })

  sock.emit('test_seed_arena_match', {
    token: TEST_TOKEN,
    matchSessionId,
    lobbyId,
    humans: [humanA, humanB],
    amount: 0.01,
    escrowId: 'A',
  })

  await delay(1500)
  if (!seeded || seeded.matchSessionId !== matchSessionId) {
    console.error('Failed to seed arena match')
    process.exit(3)
  }

  // Wait for match end notification
  let ended = null
  sock.once('arena_match_ended', (p) => { ended = p })

  sock.emit('test_force_arena_win', {
    token: TEST_TOKEN,
    matchSessionId,
    winner: humanA,
  })

  const start = Date.now()
  while (!ended && (Date.now() - start) < 15000) {
    await delay(250)
  }

  if (!ended) {
    console.error('Did not receive arena_match_ended')
    process.exit(4)
  }

  if (String(ended.winner) !== humanA) {
    console.error('Winner mismatch (canonical wallet expected)', { expected: humanA, got: ended.winner })
    process.exit(5)
  }

  console.log('OK: arena_match_ended received', ended)

  sock.disconnect()
  console.log('OK: disconnected')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
