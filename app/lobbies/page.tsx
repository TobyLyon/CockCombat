import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'
export const prerender = false

export default function LobbiesRedirect() {
  // Alias route so /lobbies takes users to the lobbies page at /arena
  redirect("/arena")
}


