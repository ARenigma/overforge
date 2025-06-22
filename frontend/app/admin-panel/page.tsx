"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Shield, Users, UserCheck, LogOut, Settings, BarChart3, Trash2, Edit, Plus, RefreshCw, Download, Eye, XCircle, CheckCircle, Clock, Activity } from "lucide-react"

interface User {
  id: number
  username: string
  email: string
  firstName: string
  lastName: string
  role: string
  isActive: boolean
  lastLogin: string
  createdAt: string
  organization?: string
  department?: string
}

interface Session {
  id: string
  sessionCode: string
  title: string
  status: string
  language: string
  interviewerId: number
  candidateId?: number
  startedAt?: string
  completedAt?: string
  createdAt: string
}

interface SystemStats {
  totalUsers: number
  activeUsers: number
  totalSessions: number
  activeSessions: number
  completedSessions: number
  systemUptime: string
  dbStatus: string
  aiStatus: string
}

export default function AdminPanel() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  
  // Data states
  const [users, setUsers] = useState<User[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  
  // Modal states
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  useEffect(() => {
    checkAuth()
  }, [router])

  useEffect(() => {
    if (user) {
      loadSystemStats()
    }
  }, [user])

  const checkAuth = () => {
    const storedUser = localStorage.getItem("user")
    const token = localStorage.getItem("auth_token")
    
    if (!storedUser || !token) {
      router.push("/auth")
      return
    }

    try {
      const userData = JSON.parse(storedUser)
      if (userData.role !== 'admin') {
        if (userData.role === 'interviewer') {
          router.push("/dashboard/interviewer")
        } else {
          router.push("/dashboard/candidate")
        }
        return
      }
      setUser(userData)
    } catch (error) {
      console.error("Error parsing user data:", error)
      router.push("/auth")
      return
    }
    
    setLoading(false)
  }

  const makeAuthenticatedRequest = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("auth_token")
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
  }

  const loadSystemStats = async () => {
    try {
      // Simulated system stats - replace with real API calls
      setSystemStats({
        totalUsers: 0,
        activeUsers: 0,
        totalSessions: 0,
        activeSessions: 0,
        completedSessions: 0,
        systemUptime: "99.9%",
        dbStatus: "Connected",
        aiStatus: "Available"
      })
    } catch (error) {
      console.error("Error loading system stats:", error)
    }
  }

  const loadUsers = async () => {
    setLoadingData(true)
    try {
      const response = await makeAuthenticatedRequest("/api/admin/users")
      if (response.ok) {
        const data = await response.json()
        setUsers(data.data || [])
        setSystemStats(prev => prev ? { ...prev, totalUsers: data.data?.length || 0 } : null)
      }
    } catch (error) {
      console.error("Error loading users:", error)
    }
    setLoadingData(false)
  }

  const loadSessions = async () => {
    setLoadingData(true)
    try {
      const response = await makeAuthenticatedRequest("/api/sessions")
      if (response.ok) {
        const data = await response.json()
        setSessions(data.data || [])
        const activeSessions = data.data?.filter((s: Session) => s.status === 'active').length || 0
        const completedSessions = data.data?.filter((s: Session) => s.status === 'completed').length || 0
        setSystemStats(prev => prev ? { 
          ...prev, 
          totalSessions: data.data?.length || 0,
          activeSessions,
          completedSessions
        } : null)
      }
    } catch (error) {
      console.error("Error loading sessions:", error)
    }
    setLoadingData(false)
  }

  const handleDeleteUser = async (userId: number) => {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return
    }

    try {
      const response = await makeAuthenticatedRequest(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        await loadUsers()
        alert("User deleted successfully")
      } else {
        alert("Failed to delete user")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      alert("Error deleting user")
    }
  }

  const handleToggleUserStatus = async (userId: number, isActive: boolean) => {
    try {
      const response = await makeAuthenticatedRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !isActive })
      })
      
      if (response.ok) {
        await loadUsers()
        alert(`User ${!isActive ? 'activated' : 'deactivated'} successfully`)
      } else {
        alert("Failed to update user status")
      }
    } catch (error) {
      console.error("Error updating user status:", error)
      alert("Error updating user status")
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
      return
    }

    try {
      const response = await makeAuthenticatedRequest(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        await loadSessions()
        alert("Session deleted successfully")
      } else {
        alert("Failed to delete session")
      }
    } catch (error) {
      console.error("Error deleting session:", error)
      alert("Error deleting session")
    }
  }

  const handleExportData = async (type: 'users' | 'sessions') => {
    try {
      const response = await makeAuthenticatedRequest(`/api/admin/export/${type}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert("Export failed")
      }
    } catch (error) {
      console.error("Error exporting data:", error)
      alert("Error exporting data")
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("user")
    router.push("/")
  }

  const navigateToPanel = (panel: string) => {
    if (panel === "candidate-panel") {
      router.push("/dashboard/candidate")
    } else if (panel === "interviewer-panel") {
      router.push("/dashboard/interviewer")
    } else {
      router.push(`/${panel}`)
    }
  }

  const handleViewAnalytics = () => {
    setActiveTab("analytics")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-orange-500 mr-3" />
              <div>
                <h1 className="text-xl text-gray-900">
                  <span className="text-gray-900">Over</span><span className="text-orange-500 font-bold">Forge</span> Admin
                </h1>
                <p className="text-sm text-gray-500">Master Administration Panel</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-gray-500">Administrator</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="flex items-center"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Welcome Alert */}
          <Alert className="mb-6 border-orange-300 bg-orange-50">
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-orange-700">
              Welcome to the admin panel! You have full access to both candidate and interviewer features.
            </AlertDescription>
          </Alert>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Quick Access Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Candidate Panel Access */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateToPanel("candidate-panel")}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Candidate Panel</CardTitle>
                    <Users className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">Access</div>
                    <p className="text-xs text-gray-600">
                      View and test the candidate experience
                    </p>
                    <Button className="w-full mt-4 bg-blue-600 hover:bg-blue-700">
                      <Users className="h-4 w-4 mr-2" />
                      Enter Candidate Panel
                    </Button>
                  </CardContent>
                </Card>

                {/* Interviewer Panel Access */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigateToPanel("interviewer-panel")}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Interviewer Panel</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">Access</div>
                    <p className="text-xs text-gray-600">
                      Manage interviews and sessions
                    </p>
                    <Button className="w-full mt-4 bg-green-600 hover:bg-green-700">
                      <UserCheck className="h-4 w-4 mr-2" />
                      Enter Interviewer Panel
                    </Button>
                  </CardContent>
                </Card>

                {/* System Overview */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">System Overview</CardTitle>
                    <BarChart3 className="h-4 w-4 text-orange-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">Active</div>
                    <p className="text-xs text-gray-600">
                      All systems operational
                    </p>
                    <Button variant="outline" className="w-full mt-4" onClick={handleViewAnalytics}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      View Analytics
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Admin Features */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Admin Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Settings className="h-5 w-5 mr-2" />
                      Admin Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start" onClick={() => setActiveTab("users")}>
                      <Users className="h-4 w-4 mr-2" />
                      Manage Users
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => setActiveTab("sessions")}>
                      <UserCheck className="h-4 w-4 mr-2" />
                      Manage Sessions
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => setActiveTab("analytics")}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      System Reports
                    </Button>
                    <Button variant="outline" className="w-full justify-start" onClick={() => setActiveTab("settings")}>
                      <Settings className="h-4 w-4 mr-2" />
                      System Settings
                    </Button>
                  </CardContent>
                </Card>

                {/* System Status */}
                <Card>
                  <CardHeader>
                    <CardTitle>System Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Database</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {systemStats?.dbStatus || "Connected"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Authentication</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Sessions</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">Operational</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">AI Services</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {systemStats?.aiStatus || "Available"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Stats */}
              {systemStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <Users className="h-8 w-8 text-blue-500" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Total Users</p>
                          <p className="text-2xl font-bold">{systemStats.totalUsers}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <Activity className="h-8 w-8 text-green-500" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Active Sessions</p>
                          <p className="text-2xl font-bold">{systemStats.activeSessions}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <CheckCircle className="h-8 w-8 text-purple-500" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Completed</p>
                          <p className="text-2xl font-bold">{systemStats.completedSessions}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center">
                        <BarChart3 className="h-8 w-8 text-orange-500" />
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Uptime</p>
                          <p className="text-2xl font-bold">{systemStats.systemUptime}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">User Management</h2>
                <div className="flex gap-2">
                  <Button onClick={loadUsers} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={() => handleExportData('users')} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  <ScrollArea className="h-96">
                    <div className="p-6">
                      {loadingData ? (
                        <div className="flex justify-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin" />
                        </div>
                      ) : users.length === 0 ? (
                        <div className="text-center py-8">
                          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-500">No users found. Click refresh to load users.</p>
                          <Button onClick={loadUsers} className="mt-4">Load Users</Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {users.map((user) => (
                            <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center space-x-4">
                                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                  <Users className="h-5 w-5 text-gray-600" />
                                </div>
                                <div>
                                  <p className="font-medium">{user.firstName} {user.lastName}</p>
                                  <p className="text-sm text-gray-500">{user.email}</p>
                                  <div className="flex items-center space-x-2 mt-1">
                                    <Badge variant={user.role === 'admin' ? 'destructive' : user.role === 'interviewer' ? 'default' : 'secondary'}>
                                      {user.role}
                                    </Badge>
                                    <Badge variant={user.isActive ? 'default' : 'secondary'}>
                                      {user.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setSelectedUser(user)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleToggleUserStatus(user.id, user.isActive)}
                                >
                                  {user.isActive ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                                </Button>
                                {user.role !== 'admin' && (
                                  <Button 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={() => handleDeleteUser(user.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sessions" className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Session Management</h2>
                <div className="flex gap-2">
                  <Button onClick={loadSessions} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={() => handleExportData('sessions')} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  <ScrollArea className="h-96">
                    <div className="p-6">
                      {loadingData ? (
                        <div className="flex justify-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin" />
                        </div>
                      ) : sessions.length === 0 ? (
                        <div className="text-center py-8">
                          <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-500">No sessions found. Click refresh to load sessions.</p>
                          <Button onClick={loadSessions} className="mt-4">Load Sessions</Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {sessions.map((session) => (
                            <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center space-x-4">
                                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                  <Activity className="h-5 w-5 text-gray-600" />
                                </div>
                                <div>
                                  <p className="font-medium">{session.title}</p>
                                  <p className="text-sm text-gray-500">Code: {session.sessionCode}</p>
                                  <div className="flex items-center space-x-2 mt-1">
                                    <Badge variant={session.status === 'active' ? 'default' : session.status === 'completed' ? 'secondary' : 'destructive'}>
                                      {session.status}
                                    </Badge>
                                    <Badge variant="outline">{session.language}</Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setSelectedSession(session)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => handleDeleteSession(session.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <h2 className="text-2xl font-bold">System Analytics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>User Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span>Total Users</span>
                        <span className="font-bold">{systemStats?.totalUsers || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Users</span>
                        <span className="font-bold">{systemStats?.activeUsers || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>User Growth</span>
                        <Badge variant="default" className="bg-green-100 text-green-800">+12%</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Session Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span>Total Sessions</span>
                        <span className="font-bold">{systemStats?.totalSessions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Sessions</span>
                        <span className="font-bold">{systemStats?.activeSessions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Completion Rate</span>
                        <Badge variant="default" className="bg-blue-100 text-blue-800">85%</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>System Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{systemStats?.systemUptime || "99.9%"}</p>
                      <p className="text-sm text-gray-600">Uptime</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">2.1s</p>
                      <p className="text-sm text-gray-600">Avg Response Time</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-600">0.01%</p>
                      <p className="text-sm text-gray-600">Error Rate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <h2 className="text-2xl font-bold">System Settings</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>System Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="max-duration">Maximum Session Duration (minutes)</Label>
                      <Input id="max-duration" type="number" defaultValue="60" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assessment-threshold">Assessment Detection Threshold</Label>
                      <Input id="assessment-threshold" type="number" defaultValue="50" min="10" max="500" />
                      <p className="text-xs text-gray-500">Minimum characters before triggering assessment</p>
                    </div>

                    <div>
                      <Label htmlFor="default-language">Default Programming Language</Label>
                      <Select defaultValue="javascript">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="java">Java</SelectItem>
                          <SelectItem value="cpp">C++</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full">Save Configuration</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>AI Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="ai-model">Primary AI Model</Label>
                      <Select defaultValue="codestral">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="codestral">Codestral 2501</SelectItem>
                          <SelectItem value="qwen">Qwen 2.5 Coder 32B</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button className="w-full">Update AI Settings</Button>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Database Maintenance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    <Button variant="outline">Backup Database</Button>
                    <Button variant="outline">Clean Old Sessions</Button>
                    <Button variant="outline">Optimize Database</Button>
                    <Button variant="destructive">Reset System (Danger)</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* User Detail Modal */}
          {selectedUser && (
            <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>User Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Name</Label>
                      <p className="text-sm">{selectedUser.firstName} {selectedUser.lastName}</p>
                    </div>
                    <div>
                      <Label>Email</Label>
                      <p className="text-sm">{selectedUser.email}</p>
                    </div>
                    <div>
                      <Label>Username</Label>
                      <p className="text-sm">{selectedUser.username}</p>
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Badge variant={selectedUser.role === 'admin' ? 'destructive' : 'default'}>
                        {selectedUser.role}
                      </Badge>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Badge variant={selectedUser.isActive ? 'default' : 'secondary'}>
                        {selectedUser.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div>
                      <Label>Last Login</Label>
                      <p className="text-sm">{selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleDateString() : 'Never'}</p>
                    </div>
                  </div>
                  {selectedUser.organization && (
                    <div>
                      <Label>Organization</Label>
                      <p className="text-sm">{selectedUser.organization}</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Session Detail Modal */}
          {selectedSession && (
            <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Session Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Title</Label>
                      <p className="text-sm">{selectedSession.title}</p>
                    </div>
                    <div>
                      <Label>Session Code</Label>
                      <p className="text-sm font-mono">{selectedSession.sessionCode}</p>
                    </div>
                    <div>
                      <Label>Language</Label>
                      <Badge>{selectedSession.language}</Badge>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Badge variant={selectedSession.status === 'active' ? 'default' : 'secondary'}>
                        {selectedSession.status}
                      </Badge>
                    </div>
                    <div>
                      <Label>Created</Label>
                      <p className="text-sm">{new Date(selectedSession.createdAt).toLocaleDateString()}</p>
                    </div>
                    {selectedSession.startedAt && (
                      <div>
                        <Label>Started</Label>
                        <p className="text-sm">{new Date(selectedSession.startedAt).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* User Info */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Your Admin Account</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Name</label>
                  <p className="text-sm text-gray-900">{user.firstName} {user.lastName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <p className="text-sm text-gray-900">{user.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Username</label>
                  <p className="text-sm text-gray-900">{user.username}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Role</label>
                  <p className="text-sm text-gray-900 flex items-center">
                    <Shield className="h-4 w-4 mr-1 text-orange-500" />
                    Administrator
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
} 