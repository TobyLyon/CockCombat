import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SiweMessage } from "https://esm.sh/siwe@2.1.4";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey",
      },
    });
  }

  try {
    const { address, chainId } = await req.json();
    const siweMessage = new SiweMessage({
      domain: new URL(req.headers.get("origin")).host,
      address,
      statement: "Sign in with Solana to the app.",
      uri: req.headers.get("origin"),
      version: "1",
      chainId,
      nonce: crypto.randomUUID(),
    });

    return new Response(JSON.stringify(siweMessage.prepareMessage()), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey",
      },
    });
  }
}); 