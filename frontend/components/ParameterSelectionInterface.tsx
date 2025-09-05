"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Code, 
  ArrowRight, 
  CheckCircle, 
  Settings,
  AlertTriangle,
  Target,
  TrendingUp,
  X
} from "lucide-react"
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

interface FetchedAvailableProblems {
  coreLanguageProblems: Array<{ id: number; title: string; framework: string | null }>;
  techStackProblems: Array<{ id: number; title: string; }>;
  totalProblems: number;
}

const experienceLevels = [
  { 
    value: "junior", 
    label: "Junior (0-2 years)", 
    tag: "Junior", 
    description: "Basic programming concepts and simple algorithms"
  },
  { 
    value: "mid", 
    label: "Mid-level (2-5 years)", 
    tag: "Mid-level", 
    description: "Data structures, algorithms, and system design basics"
  },
  { 
    value: "senior", 
    label: "Senior (5+ years)", 
    tag: "Senior", 
    description: "Complex algorithms, system design, and architecture"
  },
]

export default function ParameterSelectionInterface() {
  const [coreLanguages, setCoreLanguages] = useState<CoreLanguage[]>([])
  const [techStacks, setTechStacks] = useState<GroupedTechStacks>({})
  const [availableProblems, setAvailableProblems] = useState<{
    core: any[],
    framework: any[],
    techStack: any[]
  } | null>(null)
  
  const [selectedCoreLanguage, setSelectedCoreLanguage] = useState("")
  const [selectedFramework, setSelectedFramework] = useState("")
  const [selectedFrameworkLanguage, setSelectedFrameworkLanguage] = useState("")
  const [selectedTechStack, setSelectedTechStack] = useState("")
  const [selectedSubcategory, setSelectedSubcategory] = useState("")
  const [selectedSeniority, setSelectedSeniority] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [problemsLoading, setProblemsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const { user, token, loading: authLoading } = useSupabaseAuth()

  useEffect(() => {
    if (user && token) {
      fetchParameterData(token)
    }
  }, [user, token])

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
    const coreSelected = !!selectedCoreLanguage;
    const frameworkSelected = !!selectedFrameworkLanguage && !!selectedFramework;
    const techStackSelected = !!selectedTechStack && !!selectedSubcategory;

    if (!selectedSeniority || !(coreSelected || frameworkSelected || techStackSelected)) {
      setAvailableProblems(null);
      return;
    }

    try {
      setProblemsLoading(true);

      const payload: { [key: string]: any } = {
        seniorityLevel: selectedSeniority,
      };

      // We now send both language selections to the backend.
      // The backend will handle fetching problems for each.
      if (coreSelected) {
        payload.coreLanguage = selectedCoreLanguage;
      }
      if (frameworkSelected) {
        payload.frameworkLanguage = selectedFrameworkLanguage;
        payload.framework = selectedFramework; // Add the specific framework name
      }

      if (techStackSelected) {
        payload.techStack = selectedTechStack;
        payload.techSubcategory = selectedSubcategory;
      }
      
      const response = await fetch('/api/parameter-selection/available-problems', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const responseData = await response.json();
        const problemData: FetchedAvailableProblems | null = responseData.data;
        
        // Process the data to split core and framework problems based on the 'framework' field
        if (problemData && problemData.coreLanguageProblems) {
          const allProblemsForLang = problemData.coreLanguageProblems;

          const core = allProblemsForLang.filter(p => p.framework === null);
          
          // Only count problems for the selected framework, if any
          const framework = selectedFramework 
            ? allProblemsForLang.filter(p => p.framework === selectedFramework) 
            : [];
          
          setAvailableProblems({
            core,
            framework,
            techStack: problemData.techStackProblems || []
          });
        } else {
          setAvailableProblems(null);
        }
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
    checkAvailableProblems();
  }, [selectedCoreLanguage, selectedFramework, selectedFrameworkLanguage, selectedTechStack, selectedSubcategory, selectedSeniority])

  const canProceed = () => {
    if (!selectedSeniority) return false;
    const coreIsValid = !!selectedCoreLanguage;
    const frameworkIsValid = !!selectedFrameworkLanguage && !!selectedFramework;
    const techStackIsValid = !!selectedTechStack && !!selectedSubcategory;
    return coreIsValid || frameworkIsValid || techStackIsValid;
  }

  const handleProceed = async () => {
    if (!canProceed()) {
      setError("Please select an experience level and fill out at least one category (Core, Framework, or Tech Stack).");
      return;
    };

    try {
      setLoading(true)
      setError(null)

      const payload: { [key: string]: any } = {
        seniorityLevel: selectedSeniority,
      };
      if (selectedCoreLanguage) {
        payload.coreLanguage = selectedCoreLanguage;
      }
      if (selectedFramework) {
        payload.coreFramework = selectedFramework;
        payload.frameworkLanguage = selectedFrameworkLanguage;
      }
      if (selectedTechStack && selectedSubcategory) {
        payload.techStack = selectedTechStack;
        payload.techSubcategory = selectedSubcategory;
      }

      const response = await fetch('/api/parameter-selection/create-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/room/${data.data.sessionId}?role=interviewer`)
      } else {
        setError(data.error || 'Failed to create session')
      }
    } catch (error) {
      console.error('Error creating session:', error)
      setError('Network error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getFrameworksForLanguage = (langName: string) => {
    const language = coreLanguages.find(lang => lang.name === langName)
    return language?.frameworks || []
  }

  const getSelectedTechStackDetails = () => {
    return selectedSubcategory ? techStacks[selectedSubcategory] || [] : []
  }

  if (authLoading || (loading && coreLanguages.length === 0)) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading parameter options...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2 p-4 border rounded-lg bg-white">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-2">
            <Code className="w-5 h-5 mr-2 text-orange-500" />
            Core Language
          </h3>
          <Select value={selectedCoreLanguage} onValueChange={(value) => {
            setSelectedCoreLanguage(value);
            setSelectedFramework(''); // Always clear framework when core lang changes
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a language" />
            </SelectTrigger>
            <SelectContent>
              {coreLanguages.map((language) => (
                <SelectItem key={language.name} value={language.name}>
                  {language.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCoreLanguage && (
            <button onClick={() => { setSelectedCoreLanguage(''); setSelectedFramework(''); }} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1 pl-1">
              <X className="w-3 h-3" />
              <span>Clear selection</span>
            </button>
          )}
        </div>

        <div className={`space-y-2 p-4 border rounded-lg bg-white`}>
          <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-2">
            <Code className="w-5 h-5 mr-2 text-orange-500" />
            Framework
          </h3>
          <Select value={selectedFrameworkLanguage} onValueChange={(value) => {
            setSelectedFrameworkLanguage(value);
            setSelectedFramework(''); // Clear framework when language changes
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a language" />
            </SelectTrigger>
            <SelectContent>
              {coreLanguages.filter(l => l.frameworks && l.frameworks.length > 0).map((language) => (
                <SelectItem key={language.name} value={language.name}>
                  {language.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedFrameworkLanguage && (
            <button onClick={() => { setSelectedFrameworkLanguage(''); setSelectedFramework(''); }} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1 pl-1">
              <X className="w-3 h-3" />
              <span>Clear selection</span>
            </button>
          )}

          <Select value={selectedFramework} onValueChange={setSelectedFramework} disabled={!selectedFrameworkLanguage}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a framework" />
            </SelectTrigger>
            <SelectContent>
              {getFrameworksForLanguage(selectedFrameworkLanguage).map((framework) => (
                <SelectItem key={framework} value={framework}>
                  {framework}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedFramework && (
            <button onClick={() => setSelectedFramework('')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1 pl-1">
              <X className="w-3 h-3" />
              <span>Clear selection</span>
            </button>
          )}
        </div>

        <div className="space-y-2 p-4 border rounded-lg bg-white">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-2">
            <Settings className="w-5 h-5 mr-2 text-orange-500" />
            Technology Stack
          </h3>
          <Select value={selectedSubcategory} onValueChange={(value) => {
            setSelectedSubcategory(value);
            setSelectedTechStack(''); // Always clear specific tech when category changes
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(techStacks).map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSubcategory && (
            <button onClick={() => { setSelectedSubcategory(''); setSelectedTechStack(''); }} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1 pl-1">
              <X className="w-3 h-3" />
              <span>Clear selection</span>
            </button>
          )}

          <Select value={selectedTechStack} onValueChange={setSelectedTechStack} disabled={!selectedSubcategory}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a technology" />
            </SelectTrigger>
            <SelectContent>
              {getSelectedTechStackDetails().map((tech) => (
                <SelectItem key={tech.name} value={tech.name}>
                  {tech.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTechStack && (
            <button onClick={() => setSelectedTechStack('')} className="text-xs text-gray-500 hover:text-gray-800 flex items-center space-x-1 pl-1">
              <X className="w-3 h-3" />
              <span>Clear selection</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 border rounded-lg bg-white">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-3">
          <Target className="w-5 h-5 mr-2 text-orange-500" />
          Experience Level
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {experienceLevels.map((level) => (
            <button
              key={level.value}
              onClick={() => setSelectedSeniority(level.value)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all text-center ${selectedSeniority === level.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300'}`}
            >
              <h4 className="font-semibold text-gray-900">{level.tag}</h4>
              <p className="text-sm text-gray-600">{level.label.match(/\(([^)]+)\)/)?.[1]}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-4">
            <CheckCircle className="w-5 h-5 mr-2 text-orange-500" />
            Available Problems
          </h3>
          {problemsLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
            </div>
          ) : availableProblems ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Core Language Problems:</span>
                <Badge variant="secondary" className="font-semibold">{availableProblems.core.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Framework Problems:</span>
                <Badge variant="secondary" className="font-semibold">{availableProblems.framework.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Tech Stack Problems:</span>
                <Badge variant="secondary" className="font-semibold">{availableProblems.techStack.length}</Badge>
              </div>
              <div className="flex justify-between items-center pt-2 border-t mt-3">
                <span className="font-bold text-gray-800">Total Problems:</span>
                <Badge className="font-bold text-lg">{availableProblems.core.length + availableProblems.framework.length + availableProblems.techStack.length}</Badge>
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">Select parameters to see available problems.</p>
          )}
        </div>

        <div className="pt-8 text-center">
          <Button
            onClick={handleProceed}
            disabled={!canProceed() || loading}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-lg text-lg shadow-lg transition-all"
          >
            {loading ? 'Creating Session...' : 'Start Interview'}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
} 