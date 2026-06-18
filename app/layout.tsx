import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import Script from "next/script"
import Providers from "./providers"
import NavBar from "@/components/ui/nav-bar"
import { GameStateProvider } from "@/contexts/GameStateContext"

export const metadata = {
  title: "CHICKEN DINNER",
  description: `The ultimate 8-bit chicken fighting arena on Solana.`,
  icons: {
    icon: "/images/chicken-dinner-coin.png",
    shortcut: "/images/chicken-dinner-coin.png",
    apple: "/images/chicken-dinner-coin.png",
  },
  // Ensure social share URLs resolve correctly
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://chicken-dinner-production.up.railway.app'),
  openGraph: {
    type: 'website',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://chicken-dinner-production.up.railway.app',
    title: 'CHICKEN DINNER',
    description: 'JESUS CHRIST, HOW MANY DRUGS DID I JUST DO?',
    images: [
      {
        url: '/images/chicken-dinner-banner.png',
        width: 1200,
        height: 630,
        alt: 'Chicken Dinner — Only on Solana'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CHICKEN DINNER',
    description: 'JESUS CHRIST, HOW MANY DRUGS DID I JUST DO?',
    images: ['/images/chicken-dinner-banner.png']
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
      <body className="min-h-screen h-screen overflow-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <GameStateProvider>
              <div className="min-h-screen h-screen flex flex-col">
                <NavBar />
                <main className="flex-1 overflow-y-auto">{children}</main>
              </div>
            </GameStateProvider>
          </Providers>
        </ThemeProvider>
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js" />
      </body>
    </html>
  )
}
