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
  Briefcase,
  Sparkles,
  Activity,
  Clock,
  CheckCircle
} from "lucide-react"
import { useSupabaseAuth } from "@/context/SupabaseAuthContext"
import { JDUploadModal } from "@/components/jd-upload-modal"
import ErrorBoundary from "@/components/error-boundary"
import ParameterSelectionInterface from "@/components/ParameterSelectionInterface"

function InterviewerDashboard() {
  const { user, token, logout } = useSupabaseAuth()
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
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading OverForge...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-gray-50">
      {/* Enhanced Header with Brand Styling */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-center py-4">
            <div className="absolute left-0 flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
                className="text-gray-600 hover:text-orange-600 hover:bg-orange-50 flex items-center justify-center transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>

            <h1 className="text-2xl font-bold text-orange-500">
              Interview Dashboard
            </h1>
            
            <div className="absolute right-0 flex items-center gap-4">
              <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border">
                Welcome back, <span className="font-semibold text-gray-900">{user?.firstName}</span>!
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={logout}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 flex items-center justify-center transition-colors"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Alert className="mb-6 border-red-300 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-white border border-gray-200 p-1">
            <TabsTrigger 
              value="upload" 
              className="flex items-center gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Upload JD
            </TabsTrigger>
            <TabsTrigger 
              value="parameters" 
              className="flex items-center gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <Target className="w-4 h-4" />
              Select Parameters
            </TabsTrigger>
            <TabsTrigger 
              value="link" 
              className="flex items-center gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Generate Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6 mt-6">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <CardTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  Upload Job Description
                </CardTitle>
                <CardDescription className="text-gray-600">
                  Upload a job description file to automatically generate a tailored 3-parameter assessment system
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="text-center p-4 border border-gray-200 rounded-lg hover:border-orange-200 transition-colors">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto shadow-md">1</div>
                    <h3 className="font-semibold text-gray-900 mb-2">Upload JD</h3>
                    <p className="text-sm text-gray-600">Select PDF, DOCX, or TXT file</p>
                  </div>
                  <div className="text-center p-4 border border-gray-200 rounded-lg hover:border-orange-200 transition-colors">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto shadow-md">2</div>
                    <h3 className="font-semibold text-gray-900 mb-2">AI Analysis</h3>
                    <p className="text-sm text-gray-600">Extract key parameters</p>
                  </div>
                  <div className="text-center p-4 border border-gray-200 rounded-lg hover:border-orange-200 transition-colors">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-full flex items-center justify-center font-bold mb-4 mx-auto shadow-md">3</div>
                    <h3 className="font-semibold text-gray-900 mb-2">Generate Session</h3>
                    <p className="text-sm text-gray-600">Auto-create interview</p>
                  </div>
                </div>
                
                                 <JDUploadModal
                   onSuccess={(result) => {
                     console.log('JD uploaded successfully:', result)
                     setActiveTab('parameters')
                   }}
                   onError={(error) => {
                     setError('JD upload failed: ' + error)
                   }}
                   trigger={
                     <Button 
                       className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md transition-all duration-200"
                       size="lg"
                     >
                       <Upload className="w-5 h-5 mr-2" />
                       Upload Job Description
                     </Button>
                   }
                 />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parameters" className="space-y-6 mt-6">
            <ParameterSelectionInterface />
          </TabsContent>

          <TabsContent value="link" className="space-y-6 mt-6">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <CardTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center">
                    <ExternalLink className="w-5 h-5" />
                  </div>
                  Generate Interview Link
                </CardTitle>
                <CardDescription className="text-gray-600">
                  Create a shareable link for candidates to join your interview session
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Session Title
                    </label>
                    <Input
                      placeholder="e.g., Frontend Developer Interview - John Doe"
                      value={sessionTitle}
                      onChange={(e) => setSessionTitle(e.target.value)}
                      className="w-full border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                    />
                  </div>
                  
                  <Button 
                    onClick={generateInterviewLink}
                    disabled={loading || !sessionTitle.trim()}
                    className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 text-white shadow-md transition-all duration-200"
                    size="lg"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-5 h-5 mr-2" />
                        Generate Interview Link
                      </>
                    )}
                  </Button>
                </div>

                {generatedLink && (
                  <div className="space-y-4 p-6 bg-gradient-to-r from-green-50 to-white border border-green-200 rounded-lg">
                    <h3 className="font-semibold text-green-900 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Interview Session Created!
                    </h3>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Session Code</label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 p-3 bg-gray-100 border border-gray-300 rounded-lg font-mono text-sm">
                            {sessionCode}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(sessionCode, 'code')}
                            className="border-gray-300 hover:border-orange-300 hover:bg-orange-50"
                          >
                            {copiedCode === 'code' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Interview Link</label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 p-3 bg-gray-100 border border-gray-300 rounded-lg font-mono text-sm break-all">
                            {generatedLink}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(generatedLink, 'link')}
                            className="border-gray-300 hover:border-orange-300 hover:bg-orange-50"
                          >
                            {copiedCode === 'link' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button
                        onClick={() => window.open(generatedLink, '_blank')}
                        variant="outline"
                        className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Test Link
                      </Button>
                      <Button
                        onClick={() => router.push(`/room/${sessionCode}?role=interviewer`)}
                        className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Monitor Session
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
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