// Player-facing changelog shown in the landing-page "Latest Updates" panel.
// Newest first. Keep each entry short and user-friendly — no internal jargon.
// To post a new update, just add an entry at the top of this array.

export type UpdateTag = "LIVE" | "NEW" | "FIX"

export interface GameUpdate {
  date: string // short display date, e.g. "Jun 18"
  tag: UpdateTag
  title: string
}

export const GAME_UPDATES: GameUpdate[] = [
  { date: "Jun 18", tag: "LIVE", title: "Wagered SOL lobbies are live — 0.01 / 0.05 / 0.1 SOL" },
  { date: "Jun 18", tag: "NEW", title: "Mobile controls added — on-screen joystick + peck & jump" },
  { date: "Jun 18", tag: "FIX", title: "Smoother movement & server-verified hit detection" },
  { date: "Jun 18", tag: "NEW", title: "Lobby chat now saves history" },
  { date: "Jun 18", tag: "FIX", title: "Lobby cards show LIVE status during active matches" },
  { date: "Jun 18", tag: "FIX", title: "More stable lobbies — real players no longer dropped from matches" },
  { date: "Jun 17", tag: "NEW", title: "Fresh Chicken Dinner look + $DINNER token launched" },
]
