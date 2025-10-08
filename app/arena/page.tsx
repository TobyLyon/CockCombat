"use client"
import BattleArena from "@/components/battle/battle-arena"

// Note: viewport must be exported from a Server Component. Since this page uses client features,
// move viewport to app/layout.tsx (already present) and remove it here to satisfy Next.js.

export default function ArenaPage() {
  return <BattleArena />
}
