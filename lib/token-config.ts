// Single source of truth for the project token (Solana SPL mint + display symbol).
//
// The $DINNER token has launched on pump.fun — the mint is hardcoded below.
// An env override (NEXT_PUBLIC_TOKEN_MINT) is still honored if ever needed,
// but the launched mint is the default so the address shows without any env.
// Do NOT hardcode mint addresses anywhere else in the app — import from here.

export const TOKEN_SYMBOL = "DINNER" as const;

// $DINNER SPL mint (pump.fun launch).
export const TOKEN_MINT: string = (
  process.env.NEXT_PUBLIC_TOKEN_MINT || "A3pSvCXGcdvicHn8cR7PinrTjpuPLXcsTBZQTkTjpump"
).trim();

// True once a real mint has been configured via env.
export const hasToken: boolean = TOKEN_MINT.length > 0;

// Render a short, copy-friendly preview like "8YFsrVXE...npump".
export function shortMint(mint: string = TOKEN_MINT, head = 8, tail = 5): string {
  if (!mint) return "";
  if (mint.length <= head + tail + 3) return mint;
  return `${mint.slice(0, head)}...${mint.slice(-tail)}`;
}
