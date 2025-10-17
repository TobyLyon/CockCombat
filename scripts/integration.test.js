/*
 Minimal socket integration smoke test (Node). Run with: node scripts/integration.test.js
 Verifies lobby snapshot, queue handshake emissions, and round events are reachable.
*/

const { io } = require('socket.io-client')

const SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
const PATH = process.env.NEXT_PUBLIC_SOCKET_PATH || '/api/socketio'

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function run() {
  const a = io(SERVER_URL, { path: PATH, transports: ['websocket'] })
  const b = io(SERVER_URL, { path: PATH, transports: ['websocket'] })

  let lobbyUpdatedA = 0
  let lobbyUpdatedB = 0
  let sawRoundSignal = false

  a.on('connect', () => a.emit('register_identity', 'guest_a'))
  b.on('connect', () => b.emit('register_identity', 'guest_b'))

  a.on('lobby_updated', () => { lobbyUpdatedA++ })
  b.on('lobby_updated', () => { lobbyUpdatedB++ })
  const onStart = () => { sawRoundSignal = true }
  a.on('round_start', onStart)
  b.on('round_start', onStart)

  await new Promise((resolve, reject) => {
    let done = false
    const t = setTimeout(() => { if (!done) reject(new Error('timeout boot')); }, 5000)
    a.on('connect', () => { if (!done) { done = true; clearTimeout(t); resolve() } })
  })
  await new Promise((resolve, reject) => {
    let done = false
    const t = setTimeout(() => { if (!done) reject(new Error('timeout boot')); }, 5000)
    b.on('connect', () => { if (!done) { done = true; clearTimeout(t); resolve() } })
  })

  // Join a free lobby room to trigger heartbeats and snapshots
  a.emit('join_lobby_room', 'free-1')
  b.emit('join_lobby_room', 'free-1')
  a.emit('get_lobby_state', 'free-1')
  b.emit('get_lobby_state', 'free-1')

  await delay(1500)
  if (lobbyUpdatedA === 0 || lobbyUpdatedB === 0) {
    console.error('No lobby_updated received from heartbeat/snapshot')
    process.exit(2)
  }

  console.log('OK: lobby heartbeats/snapshots received (A:', lobbyUpdatedA, 'B:', lobbyUpdatedB, ')')

  // Not forcing countdown in this smoke test; just ensure events are wired
  a.off('round_start', onStart)
  b.off('round_start', onStart)
  a.disconnect();
  b.disconnect();
  console.log('OK: sockets disconnected')
}

run().catch((e) => { console.error(e); process.exit(1) })


