"use client"
import { useEffect, useState } from "react"
import { useSocket } from "../../hooks/use-socket"

// Sleek countdown shown when a solo player sits in a free lobby: the lobby
// auto-fills with AI opponents after a short countdown so the match can start.
export default function FreeAutofillBanner() {
  const { socket } = useSocket()
  const [deadline, setDeadline] = useState<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!socket) return
    const onScheduled = (data: any) => {
      const ts = Number(data?.deadlineTs) || (Date.now() + (Number(data?.seconds) || 10) * 1000)
      setDeadline(ts)
    }
    const clear = () => setDeadline(null)
    socket.on('free_autofill_scheduled', onScheduled)
    socket.on('free_autofill_cancelled', clear)
    socket.on('queue_begin', clear)
    socket.on('match_starting', clear)
    socket.on('match_started', clear)
    socket.on('arena_lock_roster', clear)
    return () => {
      try { socket.off('free_autofill_scheduled', onScheduled) } catch {}
      try { socket.off('free_autofill_cancelled', clear) } catch {}
      try { socket.off('queue_begin', clear) } catch {}
      try { socket.off('match_starting', clear) } catch {}
      try { socket.off('match_started', clear) } catch {}
      try { socket.off('arena_lock_roster', clear) } catch {}
    }
  }, [socket])

  useEffect(() => {
    if (!deadline) return
    const id = setInterval(() => setTick(t => t + 1), 200)
    return () => clearInterval(id)
  }, [deadline])

  if (!deadline) return null
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) return null
  const secs = Math.ceil(remainingMs / 1000)
  const C = 94.2 // 2*pi*15
  const pct = Math.max(0, Math.min(1, remainingMs / 10000))

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100000] pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
    >
      <div className="flex items-center gap-3 rounded-xl border-2 border-yellow-500/80 bg-black/80 backdrop-blur px-4 py-2.5 shadow-[4px_4px_0_#000] animate-in fade-in">
        <div className="relative h-9 w-9 shrink-0">
          <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#3f3f46" strokeWidth="4" />
            <circle
              cx="18" cy="18" r="15" fill="none" stroke="#FFD600" strokeWidth="4"
              strokeDasharray={`${pct * C} ${C}`} strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-yellow-300 text-xs font-bold">{secs}</span>
        </div>
        <div className="leading-tight">
          <div className="text-yellow-300 text-xs sm:text-sm font-bold pixel-font tracking-wide">FILLING WITH AI</div>
          <div className="text-white/70 text-[10px] sm:text-xs">No opponents yet — match starts in {secs}s</div>
        </div>
      </div>
    </div>
  )
}
