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
import { useSupabaseAuth } from "@/context/SupabaseAuthContext"

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

type AssessmentMode = 'core_only' | 'core_and_framework' | 'tech_stack';

export default function ParameterSelectionPage() {
  const [coreLanguages, setCoreLanguages] = useState<CoreLanguage[]>([])
  const [techStacks, setTechStacks] = useState<GroupedTechStacks>({})
  const [availableProblems, setAvailableProblems] = useState<AvailableProblems | null>(null)
  
  const [selectedCoreLanguage, setSelectedCoreLanguage] = useState("")
  const [selectedFramework, setSelectedFramework] = useState("")
  const [selectedTechStack, setSelectedTechStack] = useState("")
  const [selectedSubcategory, setSelectedSubcategory] = useState("")
  const [selectedSeniority, setSelectedSeniority] = useState("")
  
  const [assessmentMode, setAssessmentMode] = useState<AssessmentMode>('tech_stack');

  const [loading, setLoading] = useState(false)
  const [problemsLoading, setProblemsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const { user, token, loading: authLoading } = useSupabaseAuth()

  useEffect(() => {
    console.log('Parameter Selection - Auth state:', { user, token, authLoading })
    if (!authLoading && !user) {
      console.log('Parameter Selection - No user found, redirecting to login')
      router.push('/auth/login')
      return
    }
    if (user && token) {
      console.log('Parameter Selection - User authenticated, fetching data')
      fetchParameterData(token)
    }
  }, [user, token, authLoading, router])

  const fetchParameterData = async (authToken: string) => {
    try {
      setLoading(true)
      setError(null)

      const [coreResponse, techResponse] = await Promise.all([
        fetch('/api/parameter-selection/core-languages', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch('/api/parameter-selection/tech-stacks', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
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
    const baseParams: {
      coreLanguage: string;
      seniorityLevel: string;
      framework: string | null;
      techStack: string | null;
      subcategory: string | null;
    } = {
      coreLanguage: selectedCoreLanguage,
      seniorityLevel: selectedSeniority,
      framework: null,
      techStack: null,
      subcategory: null
    };

    let canCheck = false;
    switch (assessmentMode) {
      case 'core_only':
        if (selectedCoreLanguage && selectedSeniority) {
          canCheck = true;
        }
        break;
      case 'core_and_framework':
        if (selectedCoreLanguage && selectedFramework && selectedSeniority) {
          baseParams.framework = selectedFramework;
          canCheck = true;
        }
        break;
      case 'tech_stack':
        if (selectedCoreLanguage && selectedTechStack && selectedSeniority) {
          baseParams.techStack = selectedTechStack;
          baseParams.subcategory = selectedSubcategory;
          canCheck = true;
        }
        break;
    }

    if (!canCheck) return;

    try {
      setProblemsLoading(true)

      const response = await fetch('/api/parameter-selection/available-problems', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(baseParams)
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
    if (!selectedSeniority || !selectedCoreLanguage) return false;

    switch (assessmentMode) {
      case 'core_only':
        return true;
      case 'core_and_framework':
        return !!selectedFramework;
      case 'tech_stack':
        return !!selectedTechStack;
      default:
        return false;
    }
  };

  const handleProceed = async () => {
    if (!canProceed() || authLoading || !user) {
      setError("Please complete all required fields before proceeding.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/parameter-selection/create-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          assessmentMode,
          coreLanguage: selectedCoreLanguage,
          framework: assessmentMode === 'core_and_framework' ? selectedFramework : null,
          techStack: assessmentMode === 'tech_stack' ? selectedTechStack : null,
          seniorityLevel: selectedSeniority,
          subcategory: assessmentMode === 'tech_stack' ? selectedSubcategory : null,
        })
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/room/${data.roomId}`);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to create session. Please try again.');
      }
    } catch (error) {
      console.error('Error creating session:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
              <h1 className="text-3xl font-bold text-gray-900">New Parameter Selection</h1>
              <p className="text-gray-600">Choose your assessment parameters using the new questions system</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
              <User className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium">{user.firstName || user.email}</span>
              <Badge variant="secondary">{user.role || 'user'}</Badge>
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
              <CardContent className="px-8 py-6">
                {/* Assessment Mode Selection */}
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-3">1. Select Assessment Type</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button onClick={() => setAssessmentMode('core_only')} className={`p-4 border rounded-lg text-left transition-all ${assessmentMode === 'core_only' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}><h4 className="font-semibold">Core Language</h4><p className="text-sm text-gray-500">Test fundamental language and algorithm skills.</p></button>
                    <button onClick={() => setAssessmentMode('core_and_framework')} className={`p-4 border rounded-lg text-left transition-all ${assessmentMode === 'core_and_framework' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}><h4 className="font-semibold">Language + Framework</h4><p className="text-sm text-gray-500">Test core language plus a specific web framework.</p></button>
                    <button onClick={() => setAssessmentMode('tech_stack')} className={`p-4 border rounded-lg text-left transition-all ${assessmentMode === 'tech_stack' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}><h4 className="font-semibold">Full Tech Stack</h4><p className="text-sm text-gray-500">Simulate a real-world project with multiple technologies.</p></button>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* Step 2: Core Language */}
                  {(assessmentMode === 'core_only' || assessmentMode === 'core_and_framework' || assessmentMode === 'tech_stack') && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                      <div className="md:col-span-1">
                        <h3 className="font-semibold text-gray-800">2. Core Language</h3>
                        <p className="text-sm text-gray-500">Select the primary programming language.</p>
                      </div>
                      <div className="md:col-span-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {coreLanguages.map((lang) => (
                            <button key={lang.name} onClick={() => setSelectedCoreLanguage(lang.name)} className={`p-4 text-center border rounded-lg transition-all ${selectedCoreLanguage === lang.name ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}>
                              <span className="font-semibold">{lang.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2b: Framework (Conditional) */}
                  {assessmentMode === 'core_and_framework' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                      <div className="md:col-span-1">
                        <h3 className="font-semibold text-gray-800">3. Framework</h3>
                        <p className="text-sm text-gray-500">Select a framework for the chosen language.</p>
                      </div>
                      <div className="md:col-span-3">
                        <Select onValueChange={setSelectedFramework} value={selectedFramework}>
                          <SelectTrigger><SelectValue placeholder="Select a framework..." /></SelectTrigger>
                          <SelectContent>
                            {coreLanguages.find(l => l.name === selectedCoreLanguage)?.frameworks.map(fw => (
                              <SelectItem key={fw} value={fw}>{fw}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Tech Stack (Conditional) */}
                  {assessmentMode === 'tech_stack' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                      <div className="md:col-span-1">
                        <h3 className="font-semibold text-gray-800">3. Tech Stack</h3>
                        <p className="text-sm text-gray-500">Choose a primary technology to focus on.</p>
                      </div>
                      <div className="md:col-span-3 space-y-4">
                        {Object.entries(techStacks).map(([category, stacks]) => (
                          <div key={category}>
                            <h4 className="text-sm font-medium text-gray-500 mb-2 capitalize flex items-center">{getCategoryIcon(category)}<span className="ml-2">{category}</span></h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {stacks.map((stack) => (
                                <button key={stack.name} onClick={() => setSelectedTechStack(stack.name)} className={`p-4 text-center border rounded-lg transition-all ${selectedTechStack === stack.name ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}>
                                  <span className="font-semibold">{stack.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 4: Seniority Level */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                    <div className="md:col-span-1">
                      <h3 className="font-semibold text-gray-800">
                        {assessmentMode === 'tech_stack' ? '4. Seniority' : '3. Seniority'}
                      </h3>
                      <p className="text-sm text-gray-500">Choose the appropriate difficulty level for the assessment</p>
                    </div>
                    <div className="md:col-span-3">
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
                    </div>
                  </div>
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