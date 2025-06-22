import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { SupabaseAuthProvider } from "@/context/SupabaseAuthContext"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"

// Try to load Inter font, but don't let it block rendering
let inter: any = null
try {
  const { Inter } = require('next/font/google')
  inter = Inter({ 
    subsets: ["latin"],
    display: 'swap',
    fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
    variable: '--font-inter',
    // Add timeout to prevent hanging
    timeout: 5000
  })
} catch (error) {
  console.warn('Failed to load Inter font, using system fonts')
}

export const metadata: Metadata = {
  title: "Overforge - Live Technical Interviews",
  description: "Advanced coding interview platform with real-time collaboration",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Use Inter if available, otherwise fall back to system font classes
  const fontClassName = inter 
    ? `${inter.variable} font-sans antialiased`
    : 'font-sans antialiased'

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload system fonts as fallback */}
        <link
          rel="preload"
          href="data:font/woff2;base64,"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
      </head>
      <body className={fontClassName} style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SupabaseAuthProvider>
            {children}
          </SupabaseAuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
} 