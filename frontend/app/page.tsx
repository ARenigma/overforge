"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { UserCheck, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { ThemeToggle } from "@/components/theme-toggle"
import { DotGridBackground } from "@/components/dot-grid-background"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { User } from "@supabase/supabase-js"

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const [showStrikethrough, setShowStrikethrough] = useState(false)
  const [showSeconds, setShowSeconds] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Animation effect for strikethrough and "seconds" emergence
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setShowStrikethrough(true)
    }, 800)

    const timer2 = setTimeout(() => {
      setShowSeconds(true)
    }, 1400)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [])

  const handleStartPracticing = () => {
    if (user) {
      router.push('/dashboard')
    } else {
      router.push('/auth?mode=signup')
    }
  }

  const handleStartInterviewing = () => {
    if (user) {
      router.push('/dashboard')
    } else {
      router.push('/auth?mode=signup')
    }
  }

  const handleSignIn = () => {
    router.push('/auth')
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <DotGridBackground />

      {/* Header with glass effect */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl text-foreground">Over</span><span className="text-2xl text-orange-500 font-bold">Forge</span>
            </div>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              {user && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Welcome, {user.email}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSignOut}
                    className="flex items-center justify-center"
                  >
                    Sign out
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-4xl mx-auto relative z-10">
          {/* Hero Title */}
          <div className="text-center mb-8">
            <h1 className="text-4xl mb-4">
              <span className="text-foreground">Over</span><span className="text-orange-500 font-bold">Forge</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              AI-Powered Technical Interview Platform
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center text-blue-600">
                  <Users className="mr-2" />
                  For Candidates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Practice coding interviews with AI-powered feedback and real-time assistance.
                </p>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={handleStartPracticing}
                >
                  {user ? 'Go to Dashboard' : 'Start Practicing'}
                </Button>
              </CardContent>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center text-green-600">
                  <UserCheck className="mr-2" />
                  For Interviewers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Conduct efficient technical interviews with AI-assisted evaluation tools.
                </p>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleStartInterviewing}
                >
                  {user ? 'Go to Dashboard' : 'Start Interviewing'}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              Already have an account?
            </p>
            <Button
              variant="outline"
              onClick={handleSignIn}
              className="border-orange-500 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950"
            >
              Sign In
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-muted py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">
            © 2024 <span className="text-foreground">Over</span><span className="text-orange-500 font-bold">Forge</span>. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
