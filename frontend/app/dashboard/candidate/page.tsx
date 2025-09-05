"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Search, 
  Code, 
  Clock, 
  Building, 
  ExternalLink,
  Users,
  Calendar,
  Trophy,
  Settings,
  ArrowLeft,
  Copy,
  Check
} from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
// withAuth removed - using Supabase auth context directly
import { DotGridBackground } from "@/components/dot-grid-background"

interface PublicSession {
  id: string
  sessionCode: string
  title: string
  language: string
  experienceLevel: string
  maxDuration: number
  createdAt: string
  interviewer: {
    firstName: string
    lastName: string
    organization?: string
  }
}

function CandidateDashboard() {
  const { user, token, logout } = useAuth()
  const router = useRouter()
  
  const [publicSessions, setPublicSessions] = useState<PublicSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sessionCode, setSessionCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [languageFilter, setLanguageFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  useEffect(() => {
    fetchPublicSessions()
  }, [])

  const fetchPublicSessions = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/public/browse`, {
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {}
      })

      const data = await response.json()
      if (data.success) {
        setPublicSessions(data.data.sessions)
      }
    } catch (error) {
      console.error('Failed to fetch public sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionCode.trim()) return

    setIsJoining(true)
    setJoinError('')

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/${sessionCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/room/${sessionCode}?role=candidate`)
      } else {
        setJoinError(data.error || 'Failed to join session')
      }
    } catch (error) {
      setJoinError('Network error occurred')
    } finally {
      setIsJoining(false)
    }
  }

  const handleJoinPublicSession = async (sessionCode: string) => {
    setIsJoining(true)
    setJoinError('')

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/${sessionCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/room/${sessionCode}?role=candidate`)
      } else {
        setJoinError(data.error || 'Failed to join session')
      }
    } catch (error) {
      setJoinError('Network error occurred')
    } finally {
      setIsJoining(false)
    }
  }

  const copySessionCode = async (code: string) => {
    try {
      if (typeof window !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code)
        setCopiedCode(code)
        setTimeout(() => setCopiedCode(null), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getLanguageColor = (language: string) => {
    const colors: { [key: string]: string } = {
      javascript: 'bg-yellow-100 text-yellow-800',
      python: 'bg-blue-100 text-blue-800',
      java: 'bg-red-100 text-red-800',
      cpp: 'bg-purple-100 text-purple-800',
      csharp: 'bg-green-100 text-green-800',
      go: 'bg-cyan-100 text-cyan-800',
      rust: 'bg-orange-100 text-orange-800'
    }
    return colors[language] || 'bg-gray-100 text-gray-800'
  }

  const getLevelColor = (level: string) => {
    const colors: { [key: string]: string } = {
      beginner: 'bg-green-100 text-green-800',
      intermediate: 'bg-yellow-100 text-yellow-800',
      advanced: 'bg-red-100 text-red-800'
    }
    return colors[level] || 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredSessions = publicSessions.filter(session => {
    const matchesSearch = session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.interviewer.organization?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesLanguage = !languageFilter || session.language === languageFilter
    const matchesLevel = !levelFilter || session.experienceLevel === levelFilter
    
    return matchesSearch && matchesLanguage && matchesLevel
  })

  const languages = [...new Set(publicSessions.map(s => s.language))]
  const levels = [...new Set(publicSessions.map(s => s.experienceLevel))]

  if (!user) {
    router.push('/')
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <DotGridBackground />
      
      {/* Header */}
      <header className="relative z-10 bg-white/80 backdrop-blur-md border-b border-gray-200/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-gray-900 flex items-center justify-center"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
              <span className="text-2xl text-gray-900">Over</span><span className="text-2xl text-orange-500 font-bold">Forge</span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Welcome, {user.firstName}
              </span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={logout}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Users className="w-12 h-12 text-orange-500" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Candidate Dashboard
            </h1>
            <p className="text-xl text-gray-600">
              Join interview sessions and showcase your coding skills
            </p>
          </div>

          {/* Error Alert */}
          {joinError && (
            <Alert className="mb-6 border-red-300 bg-red-50">
              <AlertDescription className="text-red-700">
                {joinError}
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="join" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="join" className="flex items-center gap-2">
                <Code className="w-4 h-4" />
                Join Session
              </TabsTrigger>
              <TabsTrigger value="browse" className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Browse Sessions
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                My History
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="join" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-8">
                <Card className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-gray-900">Join by Session Code</CardTitle>
                    <CardDescription>
                      Enter a session code provided by an interviewer
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleJoinByCode} className="space-y-4">
                      <Input
                        type="text"
                        placeholder="Enter session code (e.g., ABC123)"
                        value={sessionCode}
                        onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                        className="text-center text-lg font-mono"
                        maxLength={6}
                      />
                      <Button 
                        type="submit" 
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        disabled={isJoining || !sessionCode.trim()}
                      >
                        {isJoining ? 'Joining...' : 'Join Session'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-gray-900">Quick Start</CardTitle>
                    <CardDescription>
                      Practice coding with AI assistance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-gray-600">
                      Start a practice session to improve your coding skills
                    </p>
                    <Button 
                      variant="outline" 
                      className="w-full border-orange-500 text-orange-500 hover:bg-orange-50"
                      onClick={() => router.push('/language-selection')}
                    >
                      Start Practice Session
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* How it Works */}
              <Card className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg">
                <CardContent className="p-8">
                  <h3 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
                    How it works
                  </h3>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto">1</div>
                      <h4 className="font-semibold mb-2 text-gray-900">Join Session</h4>
                      <p className="text-gray-600 text-sm">
                        Enter a session code or browse public sessions to join an interview
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto">2</div>
                      <h4 className="font-semibold mb-2 text-gray-900">Solve Problems</h4>
                      <p className="text-gray-600 text-sm">
                        Work through coding challenges in real-time with AI assistance
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto">3</div>
                      <h4 className="font-semibold mb-2 text-gray-900">Get Results</h4>
                      <p className="text-gray-600 text-sm">
                        Receive instant feedback and assessment results
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="browse" className="space-y-6">
              {/* Search and Filters */}
              <Card className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg">
                <CardHeader>
                  <CardTitle>Find Public Sessions</CardTitle>
                  <CardDescription>Browse available interview sessions from various companies</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Input
                        placeholder="Search sessions by title or company..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <Button variant="outline" onClick={fetchPublicSessions}>
                      <Search className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                  </div>

                  <div className="flex gap-4">
                    <select
                      value={languageFilter}
                      onChange={(e) => setLanguageFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">All Languages</option>
                      {languages.map(lang => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>

                    <select
                      value={levelFilter}
                      onChange={(e) => setLevelFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">All Levels</option>
                      {levels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Public Sessions List */}
              <div className="grid gap-4">
                {filteredSessions.length === 0 ? (
                  <Card className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg">
                    <CardContent className="p-8 text-center">
                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No sessions found</h3>
                      <p className="text-gray-600">Try adjusting your search criteria or check back later.</p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredSessions.map(session => (
                    <Card key={session.id} className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg hover:shadow-xl transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                              <Badge className={getLanguageColor(session.language)}>
                                {session.language}
                              </Badge>
                              <Badge className={getLevelColor(session.experienceLevel)}>
                                {session.experienceLevel}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                              <div className="flex items-center gap-1">
                                <Building className="w-4 h-4" />
                                <span>{session.interviewer.organization || 'Independent'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>{session.maxDuration} min</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>{formatDate(session.createdAt)}</span>
                              </div>
                            </div>

                            <p className="text-sm text-gray-600 mb-4">
                              Hosted by {session.interviewer.firstName} {session.interviewer.lastName}
                            </p>

                            <div className="flex items-center gap-2">
                              <code className="px-2 py-1 bg-gray-100 rounded font-mono text-sm">
                                {session.sessionCode}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copySessionCode(session.sessionCode)}
                                className="p-1 h-8 w-8"
                              >
                                {copiedCode === session.sessionCode ? (
                                  <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          <Button
                            onClick={() => handleJoinPublicSession(session.sessionCode)}
                            disabled={isJoining}
                            className="bg-orange-500 hover:bg-orange-600 text-white ml-4"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            {isJoining ? 'Joining...' : 'Join Session'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              <Card className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg">
                <CardContent className="p-8 text-center">
                  <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Session History</h3>
                  <p className="text-gray-600">Your completed interviews and practice sessions will appear here.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <Card className="bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-lg">
                <CardContent className="p-8 text-center">
                  <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Settings</h3>
                  <p className="text-gray-600">Customize your coding environment and preferences.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}

export default CandidateDashboard 