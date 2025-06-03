"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Code, ArrowRight, User } from "lucide-react"

const languages = [
  { value: "javascript", label: "JavaScript", icon: "🟨" },
  { value: "python", label: "Python", icon: "🐍" },
  { value: "java", label: "Java", icon: "☕" },
  { value: "cpp", label: "C++", icon: "⚡" },
  { value: "csharp", label: "C#", icon: "🔷" },
  { value: "go", label: "Go", icon: "🐹" },
  { value: "rust", label: "Rust", icon: "🦀" },
  { value: "typescript", label: "TypeScript", icon: "🔷" },
]

const experienceLevels = [
  { value: "junior", label: "Junior (0-2 years)", description: "Basic programming concepts and simple algorithms" },
  {
    value: "mid",
    label: "Mid-level (2-5 years)",
    description: "Data structures, algorithms, and system design basics",
  },
  { value: "senior", label: "Senior (5+ years)", description: "Complex algorithms, system design, and architecture" },
]

export default function LanguageExperienceSelector() {
  const [selectedLanguage, setSelectedLanguage] = useState("")
  const [selectedExperience, setSelectedExperience] = useState("")
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem("token")
    const userData = localStorage.getItem("user")

    if (!token || !userData) {
      router.push("/auth")
      return
    }

    setUser(JSON.parse(userData))
  }, [router])

  const handleContinue = () => {
    if (selectedLanguage && selectedExperience) {
      // Store selections in localStorage
      localStorage.setItem("selectedLanguage", selectedLanguage)
      localStorage.setItem("selectedExperience", selectedExperience)
      router.push("/rooms")
    }
  }

  const selectedLang = languages.find((lang) => lang.value === selectedLanguage)
  const selectedExp = experienceLevels.find((exp) => exp.value === selectedExperience)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Code className="h-8 w-8 text-purple-600" />
            <span className="text-2xl font-bold text-gray-900">CodeInterview</span>
          </div>
          <CardTitle className="text-2xl">Setup Your Interview Preferences</CardTitle>
          <CardDescription>
            {user && (
              <div className="flex items-center justify-center space-x-2 mt-2">
                <User className="h-4 w-4" />
                <span>
                  Welcome, {user.firstName} {user.lastName}
                </span>
              </div>
            )}
            Choose your preferred programming language and experience level for the interview
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language Selection */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Programming Language</h3>
              <p className="text-sm text-gray-600 mb-4">Select the language you'd like to use for coding challenges</p>
            </div>

            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a programming language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((language) => (
                  <SelectItem key={language.value} value={language.value}>
                    <div className="flex items-center space-x-2">
                      <span>{language.icon}</span>
                      <span>{language.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedLang && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <Badge variant="secondary" className="mb-2">
                  {selectedLang.icon} {selectedLang.label} Selected
                </Badge>
              </div>
            )}
          </div>

          {/* Experience Level Selection */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Experience Level</h3>
              <p className="text-sm text-gray-600 mb-4">
                This helps us tailor the interview questions to your skill level
              </p>
            </div>

            <Select value={selectedExperience} onValueChange={setSelectedExperience}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose your experience level" />
              </SelectTrigger>
              <SelectContent>
                {experienceLevels.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{level.label}</span>
                      <span className="text-xs text-gray-500">{level.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedExp && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <Badge variant="secondary" className="mb-2">
                  {selectedExp.label} Selected
                </Badge>
                <p className="text-sm text-gray-600">{selectedExp.description}</p>
              </div>
            )}
          </div>

          {/* Summary */}
          {selectedLanguage && selectedExperience && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-semibold text-green-800 mb-2">Interview Setup Complete</h4>
              <div className="space-y-1 text-sm text-green-700">
                <p>
                  <strong>Language:</strong> {selectedLang?.label}
                </p>
                <p>
                  <strong>Experience:</strong> {selectedExp?.label}
                </p>
              </div>
            </div>
          )}

          {/* Continue Button */}
          <Button
            onClick={handleContinue}
            disabled={!selectedLanguage || !selectedExperience}
            className="w-full"
            size="lg"
          >
            Continue to Room Selection
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
