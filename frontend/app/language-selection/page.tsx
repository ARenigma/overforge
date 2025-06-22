"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Code, ArrowRight, User, Briefcase, ArrowLeft, CheckCircle } from "lucide-react"
import { fetchJudge0Languages } from "@/lib/judge0"
import { getLanguageIcon } from "@/lib/languageIcons"
import { TypeScriptIcon } from "@/lib/customIcons"
import { DotGridBackground } from "@/components/dot-grid-background"

// Config flag: set to true to use Judge0 API, false to use static list
const USE_JUDGE0_LANGUAGES = false;

const staticLanguages = [
  { value: "javascript", label: "JavaScript", icon: "🟨", id: 63, popularity: 95 },
  { value: "python", label: "Python", icon: "🐍", id: 71, popularity: 98 },
  { value: "java", label: "Java", icon: "☕", id: 62, popularity: 90 },
  { value: "cpp", label: "C++", icon: "⚡", id: 54, popularity: 80 },
  { value: "csharp", label: "C#", icon: "🔷", id: 51, popularity: 75 },
  { value: "go", label: "Go", icon: "🐹", id: 60, popularity: 70 },
  { value: "rust", label: "Rust", icon: "🦀", id: 73, popularity: 65 },
  { value: "typescript", label: "TypeScript", icon: <TypeScriptIcon />, id: 74, popularity: 85 },
  { value: "php", label: "PHP", icon: "🐘", id: 68, popularity: 72 },
  { value: "ruby", label: "Ruby", icon: "💎", id: 72, popularity: 60 },
  { value: "swift", label: "Swift", icon: "🕊️", id: 83, popularity: 55 },
];

const experienceLevels = [
  { 
    value: "0-2", 
    label: "0-2 years", 
    tag: "Junior", 
    description: "Basic programming concepts and simple algorithms",
    color: "text-blue-600"
  },
  { 
    value: "2-5", 
    label: "2-5 years", 
    tag: "Mid-level", 
    description: "Data structures, algorithms, and system design basics",
    color: "text-purple-600"
  },
  { 
    value: "5+", 
    label: "5+ years", 
    tag: "Senior", 
    description: "Complex algorithms, system design, and architecture",
    color: "text-orange-600"
  },
]

const popularLanguageNames = [
  "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "PHP", "Ruby", "Swift"
];

interface JobProfile {
  id: string;
  title: string;
  description: string;
  experienceLevel: string;
  parameterCount: number;
}

export default function LanguageExperienceSelector() {
  const [languages, setLanguages] = useState<any[]>(USE_JUDGE0_LANGUAGES ? [] : staticLanguages)
  const [selectedLanguage, setSelectedLanguage] = useState("")
  const [selectedExperience, setSelectedExperience] = useState("")
  const [selectedJobProfile, setSelectedJobProfile] = useState("")
  const [jobProfiles, setJobProfiles] = useState<JobProfile[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [search, setSearch] = useState("")

  // Determine current selection mode based on what's selected
  const hasJobProfile = !!selectedJobProfile
  const hasLanguageAndExperience = !!selectedLanguage && !!selectedExperience

  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    const userData = localStorage.getItem("user")

    if (!token || !userData) {
      return
    }

    try {
      const parsedUser = JSON.parse(userData)
      
      if (!parsedUser || !parsedUser.id) {
        localStorage.removeItem("user")
        localStorage.removeItem("auth_token")
        return
      }
      
      setUser(parsedUser)
      fetchJobProfiles(token)
    } catch (error) {
      console.error("Error parsing user data:", error)
      localStorage.removeItem("user")
      localStorage.removeItem("auth_token")
      return
    }

    if (USE_JUDGE0_LANGUAGES) {
      fetchJudge0Languages()
        .then((langs) => {
          setLanguages(langs);
        })
        .catch(() => setLanguages([]))
    }
  }, [])

  const fetchJobProfiles = async (token: string) => {
    try {
      const response = await fetch('/api/job-profiles', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setJobProfiles(data.data || []);
      } else {
        console.error('Failed to fetch job profiles');
      }
    } catch (error) {
      console.error('Error fetching job profiles:', error);
    }
  };

  const popularLanguages = languages.filter(lang =>
    popularLanguageNames.some(name => lang.label.toLowerCase().includes(name.toLowerCase()))
  );

  const filteredPopular = popularLanguages.filter(lang =>
    lang.label.toLowerCase().includes(search.toLowerCase())
  );

  const canProceed = () => {
    return hasJobProfile || hasLanguageAndExperience;
  };

  const handleJobProfileChange = (profileId: string) => {
    setSelectedJobProfile(profileId);
    if (profileId) {
      setSelectedLanguage("");
      setSelectedExperience("");
    }
  };

  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language);
    if (language) {
      setSelectedJobProfile("");
    }
  };

  const handleExperienceChange = (experience: string) => {
    setSelectedExperience(experience);
    if (experience) {
      setSelectedJobProfile("");
    }
  };

  const handleBackToDashboard = () => {
    if (!user) {
      router.push("/auth");
      return;
    }

    const dashboardPath = user.role === 'interviewer' 
      ? '/dashboard/interviewer' 
      : user.role === 'admin'
      ? '/admin-panel'
      : '/dashboard/candidate';
    
    router.push(dashboardPath);
  };

  const handleContinue = async () => {
    if (!canProceed()) return;
    
    setLoading(true);
    try {
      const sessionId = `session-${Date.now()}`;
      const params = new URLSearchParams({
        sessionId,
        userId: user?.id || 'guest',
        username: user?.firstName || 'Guest User',
      });

      if (hasJobProfile) {
        const profile = jobProfiles.find(p => p.id === selectedJobProfile);
        params.append('jobProfile', selectedJobProfile);
        params.append('language', 'java');
        params.append('experienceLevel', profile?.experienceLevel || 'intermediate');
      } else {
        params.append('language', selectedLanguage);
        params.append('experienceLevel', selectedExperience);
      }

      router.push(`/room/${sessionId}?${params.toString()}`);
    } catch (error) {
      console.error('Error creating session:', error);
    } finally {
      setLoading(false);
    }
  };
    
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative">
      <DotGridBackground />

      {/* Header - Clean and minimal like landing page */}
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-200/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl text-gray-900">Over</span><span className="text-2xl text-orange-500 font-bold">Forge</span>
            </div>
          <Button
              variant="outline"
            onClick={handleBackToDashboard}
              className="flex items-center gap-2"
          >
              <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Centered and simple */}
      <main className="relative z-10 flex items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 pt-20">
        <div className="w-full max-w-4xl mx-auto">
          
          {/* Page Title */}
          <div className="text-center mb-12">
            <h1 className="text-3xl font-semibold text-gray-900 mb-4">
              Set Up Your Interview
            </h1>
            <p className="text-lg text-gray-600">
              Choose your interview format to get started
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            
            {/* Job Profile Option */}
            <Card className="p-6 hover:shadow-lg transition-shadow border-2 hover:border-orange-200">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Briefcase className="w-5 h-5 text-orange-500" />
                  Job Profile Assessment
                </CardTitle>
                <CardDescription>
                  Take a comprehensive assessment designed for specific roles
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedJobProfile} onValueChange={handleJobProfileChange}>
                  <SelectTrigger className="w-full h-14 py-3">
                    <SelectValue placeholder="Select a job profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{profile.title}</span>
                          <span className="text-sm text-gray-500">{profile.parameterCount} assessment parameters</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedJobProfile && (
                  <div className="p-2 bg-orange-50 rounded border border-orange-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-orange-500" />
                      <span className="text-xs font-medium text-orange-900">
                        {jobProfiles.find(p => p.id === selectedJobProfile)?.title}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custom Selection Option */}
            <Card className="p-6 hover:shadow-lg transition-shadow border-2 hover:border-blue-200">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Code className="w-5 h-5 text-blue-500" />
                  Custom Selection
                  </CardTitle>
                  <CardDescription>
                  Choose your programming language and experience level
                  </CardDescription>
                </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Language Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Programming Language
                  </label>
                  <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPopular.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{typeof lang.icon === 'string' ? lang.icon : '⚡'}</span>
                            <span>{lang.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                    </div>

                {/* Experience Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Experience Level
                  </label>
                  <Select value={selectedExperience} onValueChange={handleExperienceChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select experience" />
                    </SelectTrigger>
                    <SelectContent>
                      {experienceLevels.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{level.label}</span>
                              <Badge variant="outline" className={level.color}>
                                {level.tag}
                              </Badge>
                            </div>
                            <span className="text-sm text-gray-500">{level.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedLanguage && selectedExperience && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-blue-900">Selection Complete</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      Ready for {selectedLanguage} interview at {selectedExperience} level
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary and Continue Section */}
          {canProceed() && (
            <div className="mt-12 text-center">
              <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Start</h3>
                <p className="text-gray-600">
                  {hasJobProfile 
                    ? `Job Profile: ${jobProfiles.find(p => p.id === selectedJobProfile)?.title}`
                    : `${selectedLanguage} • ${selectedExperience} experience`
                  }
                </p>
              </div>
              
          <Button
            onClick={handleContinue}
                disabled={loading}
            size="lg"
                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3"
          >
                {loading ? (
                  "Starting Interview..."
                ) : (
                  <>
                    Start Interview
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
          </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
