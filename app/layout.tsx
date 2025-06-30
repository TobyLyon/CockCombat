import { SolanaWalletProvider } from "@/components/wallet/solana-wallet-provider"
import "@/app/globals.css"
import { AudioProvider } from "@/contexts/AudioContext"
import { GameStateProvider } from "@/contexts/GameStateContext"
import { ProfileProvider } from "@/hooks/use-profile"
import NavBar from "@/components/ui/nav-bar"
import Script from "next/script"

export const metadata = {
  title: "COCK COMBAT - 8-Bit Fighting Arena",
  description: "The ultimate 8-bit chicken fighting arena on Solana",
  generator: "v0.dev",
  keywords: ["Solana", "NFT", "Game", "Pixel Art", "Web3", "Blockchain", "Chicken", "Combat"],
  authors: [{ name: "Cock Combat Team" }],
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbbf24",
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        <title>COCK COMBAT - 8-Bit Fighting Arena</title>
        <meta name="description" content="The ultimate 8-bit chicken fighting arena on Solana" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap"
          rel="stylesheet"
        />
        {/* Prevent arrow key scrolling */}
        <Script id="prevent-arrow-scrolling" strategy="beforeInteractive">
          {`
            window.addEventListener('keydown', function(e) {
              // Prevent scrolling from arrow keys
              if([37, 38, 39, 40].indexOf(e.keyCode) > -1) {
                e.preventDefault();
                return false;
              }
            });
          `}
        </Script>
      </head>
      <body className="bg-orange-100 overflow-x-hidden">
        <AudioProvider>
          <SolanaWalletProvider>
            <ProfileProvider>
              <GameStateProvider>
                <NavBar />
                <main>{children}</main>
              </GameStateProvider>
            </ProfileProvider>
          </SolanaWalletProvider>
        </AudioProvider>
      </body>
    </html>
  )
}
