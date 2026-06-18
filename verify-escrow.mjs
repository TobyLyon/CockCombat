import fs from "fs";
import bs58 from "bs58";
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const env = fs.readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] || "").trim();

const wallets = ["A", "B", "C"].map((id) => ({
  id, pub: get(`ESCROW_WALLET_${id}_PUBLIC_KEY`), priv: get(`ESCROW_WALLET_${id}_PRIVATE_KEY`),
}));

console.log("=== keypair validity (local, no RPC) ===");
for (const w of wallets) {
  let match = false, derived = "?";
  try { const kp = Keypair.fromSecretKey(bs58.decode(w.priv)); derived = kp.publicKey.toBase58(); match = derived === w.pub; }
  catch (e) { derived = "ERR " + e.message; }
  console.log(`Wallet ${w.id} (${w.pub}): ${match ? "✅ MATCH" : "❌ MISMATCH derived=" + derived}`);
}

console.log("\n=== balances (configured Helius RPC) ===");
const conn = new Connection(get("SOLANA_RPC_URL"), "confirmed");
const probe = [...wallets.map((w) => [`A/B/C ${w.id}`, w.pub]), ["old-A", "26M1ACcX77AZxVZumQTTfUS68yzeUsdxgRXpUsZWLRFn"]];
for (const [label, addr] of probe) {
  try {
    const bal = (await conn.getBalance(new PublicKey(addr))) / LAMPORTS_PER_SOL;
    console.log(`${label} ${addr}: ${bal} SOL`);
  } catch (e) { console.log(`${label} ${addr}: ERR ${e.message.slice(0, 60)}`); }
  await new Promise((r) => setTimeout(r, 1600));
}
