"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Code, 
  ArrowRight, 
  User, 
  Briefcase, 
  ArrowLeft, 
  CheckCircle, 
  Settings,
  Cloud,
  Database,
  Container,
  Search,
  Zap,
  AlertTriangle,
  Target,
  TrendingUp
} from "lucide-react"
import { DotGridBackground } from "@/components/dot-grid-background"

interface CoreLanguage {
  name: string
  frameworks: string[]
  popularity: number
}

interface TechStack {
  name: string
  frameworks: string[]
  popularity: number
}

interface GroupedTechStacks {
  [category: string]: TechStack[]
}

interface AvailableProblems {
  coreLanguageProblems: Array<{
    id: number
    title: string
    description: string
    difficulty_level: number
    time_estimate: number
  }>
  techStackProblems: Array<{
    id: number
    title: string
    description: string
    difficulty_level: number
    time_estimate: number
  }>
  totalProblems: number
}

const experienceLevels = [
  { 
    value: "junior", 
    label: "Junior (0-2 years)", 
    tag: "Junior", 
    description: "Basic programming concepts and simple algorithms",
    color: "text-blue-600"
  },
  { 
    value: "mid", 
    label: "Mid-level (2-5 years)", 
    tag: "Mid-level", 
    description: "Data structures, algorithms, and system design basics",
    color: "text-purple-600"
  },
  { 
    value: "senior", 
    label: "Senior (5+ years)", 
    tag: "Senior", 
    description: "Complex algorithms, system design, and architecture",
    color: "text-orange-600"
  },
]

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'cloud': return <Cloud className="w-4 h-4" />
    case 'database': return <Database className="w-4 h-4" />
    case 'containerization': return <Container className="w-4 h-4" />
    case 'search': return <Search className="w-4 h-4" />
    case 'messaging': return <Zap className="w-4 h-4" />
    default: return <Settings className="w-4 h-4" />
  }
}

export function ParameterSelectionInterface() {
  const [coreLanguages, setCoreLanguages] = useState<CoreLanguage[]>([])
  const [techStacks, setTechStacks] = useState<GroupedTechStacks>({})
  const [availableProblems, setAvailableProblems] = useState<AvailableProblems | null>(null)
  
  const [selectedCoreLanguage, setSelectedCoreLanguage] = useState("")
  const [selectedFramework, setSelectedFramework] = useState("")
  const [selectedTechStack, setSelectedTechStack] = useState("")
  const [selectedSubcategory, setSelectedSubcategory] = useState("")
  const [selectedSeniority, setSelectedSeniority] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [problemsLoading, setProblemsLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    const userData = localStorage.getItem("user")

    if (!token || !userData) {
      router.push("/auth")
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      
      if (!parsedUser || !parsedUser.id) {
        localStorage.removeItem("user")
        localStorage.removeItem("auth_token")
        router.push("/auth")
        return
      }
      
      setUser(parsedUser)
      fetchParameterData(token)
    } catch (error) {
      console.error("Error parsing user data:", error)
      localStorage.removeItem("user")
      localStorage.removeItem("auth_token")
      router.push("/auth")
      return
    }
  }, [router])

  const fetchParameterData = async (token: string) => {
    try {
      setLoading(true)
      setError(null)

      const [coreResponse, techResponse] = await Promise.all([
        fetch('/api/parameter-selection/core-languages', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('/api/parameter-selection/tech-stacks', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ])

      if (coreResponse.ok) {
        const coreData = await coreResponse.json()
        setCoreLanguages(coreData.data || [])
      }

      if (techResponse.ok) {
        const techData = await techResponse.json()
        setTechStacks(techData.data || {})
      }

    } catch (error) {
      console.error('Error fetching parameter data:', error)
      setError('Failed to load parameter options. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const checkAvailableProblems = async () => {
    if (!selectedCoreLanguage || !selectedTechStack || !selectedSeniority) return

    try {
      setProblemsLoading(true)
      const token = localStorage.getItem("auth_token")

      const response = await fetch('/api/parameter-selection/available-problems', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coreLanguage: selectedCoreLanguage,
          techStack: selectedTechStack,
          framework: selectedFramework || null,
          seniorityLevel: selectedSeniority,
          subcategory: selectedSubcategory || null
        })
      })

      if (response.ok) {
        const data = await response.json()
        setAvailableProblems(data.data)
      } else {
        console.error('Failed to fetch available problems')
        setAvailableProblems(null)
      }
    } catch (error) {
      console.error('Error checking available problems:', error)
      setAvailableProblems(null)
    } finally {
      setProblemsLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCoreLanguage && selectedTechStack && selectedSeniority) {
      checkAvailableProblems()
    } else {
      setAvailableProblems(null)
    }
  }, [selectedCoreLanguage, selectedTechStack, selectedFramework, selectedSubcategory, selectedSeniority])

  const canProceed = () => {
    return selectedCoreLanguage && selectedTechStack && selectedSeniority && availableProblems && availableProblems.totalProblems > 0
  }

  const handleProceed = () => {
    if (!canProceed()) return

    const parameters = {
      coreLanguage: selectedCoreLanguage,
      framework: selectedFramework,
      techStack: selectedTechStack,
      subcategory: selectedSubcategory,
      seniorityLevel: selectedSeniority,
      availableProblems
    }

    localStorage.setItem('selected_parameters', JSON.stringify(parameters))
    router.push('/dashboard')
  }

  const handleBackToDashboard = () => {
    if (!user) {
      router.push("/auth")
      return
    }

    const dashboardPath = user.role === 'interviewer' 
      ? '/dashboard/interviewer' 
      : user.role === 'admin'
      ? '/admin-panel'
      : '/dashboard/candidate'
    
    router.push(dashboardPath)
  }

  const getSelectedFramework = () => {
    const language = coreLanguages.find(lang => lang.name === selectedCoreLanguage)
    return language?.frameworks || []
  }

  const getSelectedTechStackDetails = () => {
    if (!selectedSubcategory) return []
    return techStacks[selectedSubcategory] || []
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <DotGridBackground />
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading parameter options...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <DotGridBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={handleBackToDashboard}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Parameter Selection</h1>
              <p className="text-gray-600">Choose your assessment parameters for the interview</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
              <User className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium">{user.full_name || user.email}</span>
              <Badge variant="secondary">{user.role}</Badge>
            </div>
          )}
        </div>

        {error && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Core Programming Language
                </CardTitle>
                <CardDescription>
                  Select the primary programming language for the assessment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedCoreLanguage} onValueChange={setSelectedCoreLanguage}>
                  <SelectTrigger className="w-full h-12">
                    <SelectValue placeholder="Choose a programming language" />
                  </SelectTrigger>
                  <SelectContent>
                    {coreLanguages.map((language) => (
                      <SelectItem key={language.name} value={language.name}>
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium">{language.name}</span>
                          <Badge variant="outline" className="text-xs">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {language.popularity}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCoreLanguage && getSelectedFramework().length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Framework (Optional)
                    </label>
                    <Select value={selectedFramework} onValueChange={setSelectedFramework}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a framework (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No specific framework</SelectItem>
                        {getSelectedFramework().map((framework) => (
                          <SelectItem key={framework} value={framework}>
                            {framework}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Technology Stack
                </CardTitle>
                <CardDescription>
                  Select the technology stack or platform for assessment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Technology Category
                  </label>
                  <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a technology category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(techStacks).map((category) => (
                        <SelectItem key={category} value={category}>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(category)}
                            <span className="capitalize">{category}</span>
                            <Badge variant="outline" className="text-xs">
                              {techStacks[category].length} options
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedSubcategory && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Specific Technology
                    </label>
                    <Select value={selectedTechStack} onValueChange={setSelectedTechStack}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose specific technology" />
                      </SelectTrigger>
                      <SelectContent>
                        {getSelectedTechStackDetails().map((tech) => (
                          <SelectItem key={tech.name} value={tech.name}>
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium">{tech.name}</span>
                              <Badge variant="outline" className="text-xs">
                                <TrendingUp className="w-3 h-3 mr-1" />
                                {tech.popularity}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Experience Level
                </CardTitle>
                <CardDescription>
                  Choose the appropriate difficulty level for the assessment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {experienceLevels.map((level) => (
                    <div
                      key={level.value}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-blue-300 ${
                        selectedSeniority === level.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white'
                      }`}
                      onClick={() => setSelectedSeniority(level.value)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge 
                          variant={selectedSeniority === level.value ? "default" : "outline"}
                          className={selectedSeniority === level.value ? "bg-blue-500" : ""}
                        >
                          {level.tag}
                        </Badge>
                        {selectedSeniority === level.value && (
                          <CheckCircle className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{level.label}</h3>
                      <p className="text-sm text-gray-600">{level.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5" />
                  Available Problems
                </CardTitle>
                <CardDescription>
                  Problems available for your selection
                </CardDescription>
              </CardHeader>
              <CardContent>
                {problemsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : availableProblems ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {availableProblems.totalProblems}
                      </div>
                      <div className="text-sm text-gray-600">Total Problems</div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded">
                        <div className="font-semibold text-blue-700">
                          {availableProblems.coreLanguageProblems.length}
                        </div>
                        <div className="text-xs text-blue-600">Core Language</div>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded">
                        <div className="font-semibold text-purple-700">
                          {availableProblems.techStackProblems.length}
                        </div>
                        <div className="text-xs text-purple-600">Tech Stack</div>
                      </div>
                    </div>

                    {availableProblems.totalProblems === 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          No problems available for this combination. Try different parameters.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Select parameters to see available problems</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Selection Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Language:</span>
                    <span className="font-medium">{selectedCoreLanguage || "Not selected"}</span>
                  </div>
                  {selectedFramework && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Framework:</span>
                      <span className="font-medium">{selectedFramework}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Tech Stack:</span>
                    <span className="font-medium">{selectedTechStack || "Not selected"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Experience:</span>
                    <span className="font-medium">
                      {experienceLevels.find(level => level.value === selectedSeniority)?.tag || "Not selected"}
                    </span>
                  </div>
                </div>

                <Button 
                  className="w-full mt-4"
                  onClick={handleProceed}
                  disabled={!canProceed()}
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Start Assessment
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
} 