// Single source of truth for the project token (Solana SPL mint + display symbol).
//
// The mint is env-driven and intentionally EMPTY until the $DINNER token launches.
// Set NEXT_PUBLIC_TOKEN_MINT (build-time public env) once the mint exists.
// Do NOT hardcode mint addresses anywhere else in the app.

export const TOKEN_SYMBOL = "DINNER" as const;

export const TOKEN_MINT: string = (process.env.NEXT_PUBLIC_TOKEN_MINT || "").trim();

// True once a real mint has been configured via env.
export const hasToken: boolean = TOKEN_MINT.length > 0;

// Render a short, copy-friendly preview like "8YFsrVXE...npump".
export function shortMint(mint: string = TOKEN_MINT, head = 8, tail = 5): string {
  if (!mint) return "";
  if (mint.length <= head + tail + 3) return mint;
  return `${mint.slice(0, head)}...${mint.slice(-tail)}`;
}
