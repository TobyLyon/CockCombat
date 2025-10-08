"use client"
import dynamic from "next/dynamic"
const BattleArena = dynamic(() => import("../../components/battle/battle-arena"), { ssr: false })

export default function ArenaPage() {
  return <BattleArena />
}
