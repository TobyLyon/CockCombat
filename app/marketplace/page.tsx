import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'
export const prerender = false

export default function MarketplacePage() {
  redirect("/arena")
}
