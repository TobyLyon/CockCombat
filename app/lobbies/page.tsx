import { redirect } from "next/navigation"

export default function LobbiesRedirect() {
  // Alias route so /lobbies takes users to the lobbies page at /arena
  redirect("/arena")
}


