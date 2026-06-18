"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * On-screen touch controls for mobile play.
 *
 * The arena (EnhancedArenaScene) reads input exclusively from:
 *  - drei <KeyboardControls> (forward/back/left/right/jump/peck), and
 *  - window keydown/keyup listeners (peckRequestRef / jumpRequestRef).
 * Both listen on `window` by key `code`. So instead of threading new input
 * paths through the scene, this overlay synthesizes the exact same keyboard
 * events. That keeps movement/peck/jump working identically to desktop and is
 * unaffected by the portrait 90° rotation hack (keyboard events carry no
 * screen coordinates).
 *
 * Key map (must match controlsMap in enhanced-arena-scene.tsx):
 *  forward=KeyW  back=KeyS  left=KeyA  right=KeyD  jump=Space  peck=ShiftLeft
 */

const KEY_INFO: Record<string, { key: string; keyCode: number }> = {
  KeyW: { key: "w", keyCode: 87 },
  KeyA: { key: "a", keyCode: 65 },
  KeyS: { key: "s", keyCode: 83 },
  KeyD: { key: "d", keyCode: 68 },
  Space: { key: " ", keyCode: 32 },
  ShiftLeft: { key: "Shift", keyCode: 16 },
}

function emitKey(type: "keydown" | "keyup", code: string) {
  const info = KEY_INFO[code]
  if (!info) return
  const init: KeyboardEventInit & { keyCode?: number; which?: number } = {
    code,
    key: info.key,
    keyCode: info.keyCode,
    which: info.keyCode,
    bubbles: true,
    cancelable: true,
  }
  try { window.dispatchEvent(new KeyboardEvent(type, init)) } catch {}
  // Some listeners may be bound to document; dispatch there too (each listener
  // fires at most once since window/document are distinct targets).
  try { document.dispatchEvent(new KeyboardEvent(type, init)) } catch {}
}

function detectTouch(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (
      "ontouchstart" in window ||
      (navigator as any).maxTouchPoints > 0 ||
      window.matchMedia?.("(pointer: coarse)").matches
    )
  } catch {
    return false
  }
}

interface MobileControlsProps {
  /** Only render/active while the local player can actually move. */
  active: boolean
}

export default function MobileControls({ active }: MobileControlsProps) {
  const [show, setShow] = useState(false)
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Keys currently held by the joystick, so we only emit on transitions.
  const heldRef = useRef<Set<string>>(new Set())
  const baseRef = useRef<HTMLDivElement | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setShow(detectTouch())
  }, [])

  const releaseAll = useCallback(() => {
    for (const code of heldRef.current) emitKey("keyup", code)
    heldRef.current.clear()
    setKnob({ x: 0, y: 0 })
    originRef.current = null
  }, [])

  // Safety: release everything if controls deactivate or unmount.
  useEffect(() => {
    if (!active) releaseAll()
    return () => releaseAll()
  }, [active, releaseAll])

  const applyDesired = useCallback((desired: Set<string>) => {
    const held = heldRef.current
    // Press newly-desired keys.
    for (const code of desired) {
      if (!held.has(code)) { emitKey("keydown", code); held.add(code) }
    }
    // Release keys no longer desired.
    for (const code of Array.from(held)) {
      if (!desired.has(code)) { emitKey("keyup", code); held.delete(code) }
    }
  }, [])

  const RADIUS = 56 // px, joystick travel
  const DEAD = 14 // px deadzone

  const onJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!baseRef.current) return
    try { baseRef.current.setPointerCapture(e.pointerId) } catch {}
    const rect = baseRef.current.getBoundingClientRect()
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    onJoyMove(e)
  }

  const onJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const origin = originRef.current
    if (!origin) return
    let dx = e.clientX - origin.x
    let dy = e.clientY - origin.y
    const mag = Math.hypot(dx, dy)
    if (mag > RADIUS) { dx = (dx / mag) * RADIUS; dy = (dy / mag) * RADIUS }
    setKnob({ x: dx, y: dy })

    const desired = new Set<string>()
    if (dy < -DEAD) desired.add("KeyW")
    else if (dy > DEAD) desired.add("KeyS")
    if (dx < -DEAD) desired.add("KeyA")
    else if (dx > DEAD) desired.add("KeyD")
    applyDesired(desired)
  }

  const onJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try { baseRef.current?.releasePointerCapture(e.pointerId) } catch {}
    releaseAll()
  }

  const pressPeck = () => {
    emitKey("keydown", "ShiftLeft")
    if (peckTimerRef.current) clearTimeout(peckTimerRef.current)
    // Hold briefly so the frame loop reliably samples the press, then release.
    peckTimerRef.current = setTimeout(() => emitKey("keyup", "ShiftLeft"), 160)
  }

  const pressJump = () => {
    emitKey("keydown", "Space")
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current)
    jumpTimerRef.current = setTimeout(() => emitKey("keyup", "Space"), 100)
  }

  if (!show || !active) return null

  return (
    <div
      className="fixed inset-0 z-[10040] select-none"
      style={{ pointerEvents: "none", touchAction: "none" }}
    >
      {/* Joystick (bottom-left) */}
      <div
        ref={baseRef}
        onPointerDown={onJoyDown}
        onPointerMove={(e) => { if (originRef.current) onJoyMove(e) }}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
        className="absolute rounded-full border-2 border-yellow-400/40 bg-black/30 backdrop-blur-sm"
        style={{
          left: "max(20px, env(safe-area-inset-left))",
          bottom: "calc(24px + env(safe-area-inset-bottom))",
          width: 132,
          height: 132,
          pointerEvents: "auto",
          touchAction: "none",
        }}
        aria-label="Movement joystick"
      >
        <div
          className="absolute rounded-full bg-yellow-400/70 shadow-lg"
          style={{
            width: 56,
            height: 56,
            left: "50%",
            top: "50%",
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          }}
        />
      </div>

      {/* Action buttons (bottom-right) */}
      <div
        className="absolute flex items-end gap-4"
        style={{
          right: "max(20px, env(safe-area-inset-right))",
          bottom: "calc(24px + env(safe-area-inset-bottom))",
          pointerEvents: "none",
        }}
      >
        <button
          onPointerDown={(e) => { e.preventDefault(); pressJump() }}
          className="flex items-center justify-center rounded-full border-2 border-sky-300/50 bg-sky-500/40 text-white font-bold pixel-font active:scale-95 active:bg-sky-500/70"
          style={{ width: 76, height: 76, pointerEvents: "auto", touchAction: "none", fontSize: 12 }}
          aria-label="Jump"
        >
          JUMP
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); pressPeck() }}
          className="flex items-center justify-center rounded-full border-2 border-red-300/50 bg-red-500/50 text-white font-extrabold pixel-font active:scale-95 active:bg-red-500/80"
          style={{ width: 104, height: 104, pointerEvents: "auto", touchAction: "none", fontSize: 14 }}
          aria-label="Peck attack"
        >
          PECK
        </button>
      </div>
    </div>
  )
}
