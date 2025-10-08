import dynamic from "next/dynamic"

export const dynamic = 'force-dynamic'

const BattleArena = dynamic(() => import("../../components/battle/battle-arena"), { ssr: false })

export default function ArenaPage() {
  return <BattleArena />
}
