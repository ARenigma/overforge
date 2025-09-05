import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { SupabaseAuthProvider } from "@/context/SupabaseAuthContext"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"

// Configure Inter font with proper fallbacks
const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: "Overforge - Live Technical Interviews",
  description: "Advanced coding interview platform with real-time collaboration",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
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