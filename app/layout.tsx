import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import Script from "next/script"
import Providers from "./providers"
import NavBar from "@/components/ui/nav-bar"
import { GameStateProvider } from "@/contexts/GameStateContext"

export const metadata = {
  title: "COCK COMBAT",
  description: `The ultimate 8-bit chicken fighting arena on Solana.`,
  icons: {
    icon: "/images/logo%202.png",
    shortcut: "/images/logo%202.png",
    apple: "/images/logo%202.png",
  },
  // Ensure social share URLs resolve correctly
  metadataBase: new URL('https://www.cockcombat.xyz'),
  openGraph: {
    type: 'website',
    url: 'https://www.cockcombat.xyz',
    title: 'COCK COMBAT',
    description: 'JESUS CHRIST, HOW MANY DRUGS DID I JUST DO?',
    images: [
      {
        url: '/images/cock-combat-banner.png',
        width: 1200,
        height: 630,
        alt: 'Cock Combat Banner'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'COCK COMBAT',
    description: 'JESUS CHRIST, HOW MANY DRUGS DID I JUST DO?',
    images: ['/images/cock-combat-banner.png']
  }
}

// Disable static prerender globally to avoid SSR of R3F/Canvas during build
export const dynamic = 'force-dynamic'
export const prerender = false
export const revalidate = 0

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Add any custom head tags here */}
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <GameStateProvider>
              <NavBar />
              <main>{children}</main>
            </GameStateProvider>
          </Providers>
        </ThemeProvider>
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js" />
      </body>
    </html>
  )
}
