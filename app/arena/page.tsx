import dynamic from "next/dynamic"

const BattleArena = dynamic(() => import("@/components/battle/battle-arena"), { ssr: false })

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function ArenaPage() {
  return <BattleArena />
}
