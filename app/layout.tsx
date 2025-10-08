import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import Script from "next/script"
import Providers from "./providers"
import NavBar from "@/components/ui/nav-bar"
import { GameStateProvider } from "@/contexts/GameStateContext"

export const metadata = {
  title: "COCK COMBAT - 8-Bit Fighting Arena",
  description: `The ultimate 8-bit chicken fighting arena on BNB Chain.`,
  icons: {
    icon: "/images/logo%202.png",
    shortcut: "/images/logo%202.png",
    apple: "/images/logo%202.png",
  },
}

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
