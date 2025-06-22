"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Upload, 
  Settings,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Code,
  Target,
  TrendingUp,
  Cloud,
  Database,
  Container,
  Search,
  Zap,
  AlertTriangle,
  Users,
  Briefcase
} from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import JDUploadModal from "@/components/jd-upload-modal"
import ErrorBoundary from "@/components/error-boundary"

function InterviewerDashboard() {
  const { user, token, logout } = useAuth()
  const router = useRouter()
  
  const [sessionTitle, setSessionTitle] = useState("")
  const [generatedLink, setGeneratedLink] = useState("")
  const [sessionCode, setSessionCode] = useState("")
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('upload')

  // Add error handling for auth state
  useEffect(() => {
    if (!user && !loading) {
      console.log('No user found, redirecting to login')
      router.push('/auth/login')
    }
  }, [user, loading, router])

  const generateInterviewLink = async () => {
    if (!sessionTitle.trim()) {
      setError('Please enter a session title')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: sessionTitle,
          useNewSystem: true
        })
      })

      const data = await response.json()

      if (data.success) {
        const code = data.data.sessionCode
        setSessionCode(code)
        setGeneratedLink(`${window.location.origin}/room/${code}?role=candidate`)
      } else {
        setError(data.error || 'Failed to create session')
      }
    } catch (error) {
      setError('Network error occurred')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (text: string, type: string) => {
    try {
      if (typeof window !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setCopiedCode(type)
        setTimeout(() => setCopiedCode(null), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Show loading state while auth is being checked
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
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
                Welcome, {user?.firstName}!
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.firstName}!
          </h1>
          <p className="text-gray-600 mt-2">
            Create interview sessions using our streamlined process
          </p>
        </div>

        {error && (
          <Alert className="mb-6 border-red-300 bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-red-700">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload JD
            </TabsTrigger>
            <TabsTrigger value="parameters" className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Select Parameters
            </TabsTrigger>
            <TabsTrigger value="link" className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Generate Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload Job Description
                </CardTitle>
                <CardDescription>
                  Upload a job description file to automatically generate a tailored 3-parameter assessment system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <JDUploadModal
                  onSuccess={(result) => {
                    console.log('JD uploaded successfully:', result)
                    setActiveTab('parameters')
                  }}
                  onError={(error) => {
                    setError('JD upload failed: ' + error)
                  }}
                  trigger={
                    <Button className="w-full" size="lg">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Job Description (PDF, TXT, DOCX)
                    </Button>
                  }
                />
                <p className="text-sm text-gray-500 mt-2">
                  Supported formats: PDF, TXT, DOCX • Max size: 1MB
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-8">
                <h3 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
                  How it works
                </h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto">1</div>
                    <h4 className="font-semibold mb-2 text-gray-900">Upload Job Description</h4>
                    <p className="text-gray-600 text-sm">
                      Upload your job description and our AI will extract key requirements
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto">2</div>
                    <h4 className="font-semibold mb-2 text-gray-900">Select Parameters</h4>
                    <p className="text-gray-600 text-sm">
                      Choose programming language, tech stack, and experience level
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto">3</div>
                    <h4 className="font-semibold mb-2 text-gray-900">Generate Link</h4>
                    <p className="text-gray-600 text-sm">
                      Get an interview link to share with candidates
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parameters" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Parameter Selection</CardTitle>
                <CardDescription>
                  Choose your assessment parameters (or skip to use default parameters)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  variant="outline"
                  onClick={() => router.push('/parameter-selection')}
                  className="w-full"
                >
                  <Target className="w-4 h-4 mr-2" />
                  Go to Parameter Selection
                </Button>
                
                <div className="text-center text-sm text-gray-500">
                  or
                </div>

                <Button 
                  onClick={() => setActiveTab('link')}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Skip to Link Generation
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="link" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="w-5 h-5" />
                  Generate Interview Link
                </CardTitle>
                <CardDescription>
                  Create a shareable link for candidates to join the interview
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Session Title
                  </label>
                  <Input
                    placeholder="e.g., Frontend Developer Interview"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                  />
                </div>

                <Button 
                  className="w-full bg-orange-500 hover:bg-orange-600"
                  onClick={generateInterviewLink}
                  disabled={loading || !sessionTitle.trim()}
                >
                  {loading ? 'Generating...' : 'Generate Interview Link'}
                </Button>

                {generatedLink && (
                  <div className="space-y-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <h3 className="font-semibold text-green-800">Interview Link Generated!</h3>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-green-700">Session Code:</label>
                      <div className="flex items-center gap-2">
                        <code className="px-3 py-2 bg-white border rounded font-mono text-lg">
                          {sessionCode}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(sessionCode, 'code')}
                        >
                          {copiedCode === 'code' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-green-700">Interview Link:</label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={generatedLink}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(generatedLink, 'link')}
                        >
                          {copiedCode === 'link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => window.open(generatedLink, '_blank')}
                        className="flex-1"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Test Link
                      </Button>
                      <Button
                        onClick={() => window.open(`/room/${sessionCode}?role=interviewer`, '_blank')}
                        className="flex-1 bg-orange-500 hover:bg-orange-600"
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Monitor Session
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function InterviewerDashboardPage() {
  return (
    <ErrorBoundary>
      <InterviewerDashboard />
    </ErrorBoundary>
  )
}

export default InterviewerDashboardPage 