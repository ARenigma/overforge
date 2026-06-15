"use client"

import React, { useState } from 'react'
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Users, 
  Settings, 
  BarChart3, 
  Calendar,
  Clock,
  Target,
  ArrowRight,
  Code,
  Database,
  Cloud,
  CheckCircle,
  User,
  LogOut
} from "lucide-react"
import { Input } from "@/components/ui/input"
import DashboardLayout from "@/components/dashboard-layout"
import { useSupabaseAuth } from "@/context/SupabaseAuthContext"
import { DotGridBackground } from "@/components/dot-grid-background"
import ParameterSelectionInterface from "@/components/ParameterSelectionInterface"

interface DashboardData {
  stats: {
    totalUsers: number
    activeProjects: number
    revenue: number
    growth: number
  }
  recentActivity: Array<{
    id: string
    type: string
    description: string
    timestamp: string
    status: "success" | "pending" | "error"
  }>
  projects: Array<{
    id: string
    name: string
    status: string
    progress: number
    team: number
  }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const router = useRouter()
  const { user, token, loading: authLoading } = useSupabaseAuth()
  const [activeTab, setActiveTab] = useState("start-interview")

  // Add debugging logs
  React.useEffect(() => {
    console.log('Dashboard - Auth state:', { user, token, authLoading })
    if (!authLoading && !user) {
      console.log('Dashboard - No user found, redirecting to login')
      router.push('/auth/login')
      return
    }
    if (user && token) {
      console.log('Dashboard - User authenticated')
      setIsLoading(false)
    }
  }, [user, token, authLoading, router])

  const handleStartInterview = () => {
    router.push('/parameter-selection')
  }

  const handleManageProfiles = () => {
    router.push('/admin-panel')
  }

  const handleSignOut = () => {
    router.push('/auth/login')
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <DotGridBackground />
          <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    // Redirect is handled by the auth effect above; avoid router.push during
    // render (breaks static prerendering with "location is not defined").
    return null
  }

  const filteredProjects =
    data?.projects.filter((project) => project.name.toLowerCase().includes(searchTerm.toLowerCase())) || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <DotGridBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Interview Dashboard</h1>
            <p className="text-gray-600">Dual-Problem Assessment System</p>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">{user.firstName || user.email}</span>
                <Badge variant="secondary">{user.role || 'user'}</Badge>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSignOut}
                className="flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
            </Button>
          </div>
          )}
        </div>

        {/* System Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/70 backdrop-blur-sm border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Code className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Core Language</h3>
                  <p className="text-sm text-gray-600">Programming fundamentals</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Database className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Tech Stack</h3>
                  <p className="text-sm text-gray-600">Platform & frameworks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/70 backdrop-blur-sm border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Dual Assessment</h3>
                  <p className="text-sm text-gray-600">Comprehensive evaluation</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-white/70 backdrop-blur-sm">
            <TabsTrigger value="start-interview" className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Start Interview
            </TabsTrigger>
            <TabsTrigger value="recent-sessions" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent Sessions
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="start-interview" className="space-y-6">
            <Card className="bg-white/90 backdrop-blur-sm">
                  <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-6 h-6 text-blue-600" />
                  New Interview Session
                </CardTitle>
                    <CardDescription>
                  Configure assessment parameters and create a new dual-problem interview session
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                <ParameterSelectionInterface />
                  </CardContent>
                </Card>
          </TabsContent>

          <TabsContent value="recent-sessions" className="space-y-6">
            <Card className="bg-white/90 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-6 h-6 text-green-600" />
                  Recent Interview Sessions
                </CardTitle>
                <CardDescription>
                  View and manage your recent interview sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No recent sessions found</p>
                  <p className="text-sm">Start a new interview to see sessions here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="bg-white/90 backdrop-blur-sm">
                <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-6 h-6 text-purple-600" />
                  System Settings
                </CardTitle>
                <CardDescription>
                  Configure dashboard and interview preferences
                </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Assessment Mode</h4>
                      <p className="text-sm text-gray-600">Current: Dual-Problem System</p>
                    </div>
                    <Badge variant="secondary">Active</Badge>
                      </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Session Duration</h4>
                      <p className="text-sm text-gray-600">Default: 60 minutes</p>
                    </div>
                    <Button variant="outline" size="sm">Configure</Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Auto-Save</h4>
                      <p className="text-sm text-gray-600">Save progress automatically</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
