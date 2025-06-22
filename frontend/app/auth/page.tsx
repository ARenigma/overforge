"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, Lock, ArrowLeft, Users, UserCheck } from "lucide-react"
import { DotGridBackground } from "@/components/dot-grid-background"
import { useSupabaseAuth } from "@/context/SupabaseAuthContext"

export default function AuthPage() {
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'signin'
  
  const [loginForm, setLoginForm] = useState({
    usernameOrEmail: "",
    password: "",
  })
  const [signupForm, setSignupForm] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState("")
  const [userType, setUserType] = useState<'candidate' | 'interviewer'>('candidate')
  const router = useRouter()
  const { login, signup, loading, error: authError } = useSupabaseAuth()

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError("")
    
    console.log('AuthPage - Starting login process for:', loginForm.usernameOrEmail)
    console.log('AuthPage - User type selected:', userType)
    
    const success = await login({
      email: loginForm.usernameOrEmail,
      password: loginForm.password
    })
    
    console.log('AuthPage - Login result:', success)
    
    if (success) {
      console.log('AuthPage - Login successful, preparing redirect')
      // Redirect based on user type
      setTimeout(() => {
        console.log('AuthPage - Executing redirect for user type:', userType)
        if (userType === 'interviewer') {
          console.log('AuthPage - Redirecting to interviewer dashboard')
          router.push("/dashboard/interviewer")
        } else {
          console.log('AuthPage - Redirecting to candidate dashboard')
          router.push("/dashboard/candidate")
        }
      }, 500)
    } else {
      console.log('AuthPage - Login failed')
    }
  }

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError("")
    
    if (signupForm.password !== signupForm.confirmPassword) {
      setLocalError("Passwords do not match")
      return
    }
    
    const success = await signup({
      email: signupForm.email,
      password: signupForm.password,
      firstName: signupForm.firstName,
      lastName: signupForm.lastName,
      role: userType,
    })
    
    if (success) {
      // Redirect based on user type
      setTimeout(() => {
        if (userType === 'interviewer') {
          router.push("/dashboard/interviewer")
        } else {
          router.push("/dashboard/candidate")
        }
      }, 500)
    }
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <DotGridBackground />
      
      {/* Back to Home Button - Fixed */}
      <div className="absolute top-4 left-4 z-20">
        <Button 
          variant="ghost" 
          onClick={() => {
            console.log("Back to home clicked")
            router.push('/')
          }}
          className="text-gray-600 hover:text-gray-900 flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Button>
      </div>

      <div className="flex items-center justify-center min-h-screen p-4 relative z-10">
        <Card className="w-full max-w-md bg-white/90 backdrop-blur-sm border-gray-200/50 shadow-xl">
          <CardHeader className="text-center">
            <div className="mb-4">
              <h1 className="text-3xl text-gray-900">
                <span className="text-gray-900">Over</span><span className="text-orange-500 font-bold">Forge</span>
              </h1>
            </div>
            <CardTitle className="text-2xl text-gray-900">Welcome</CardTitle>
            <div className="text-gray-600 mb-4">
              Sign in to your account or create a new one
            </div>
          </CardHeader>
          <CardContent>
            {/* User Type Toggle */}
            <div className="mb-6">
              <Label className="text-gray-700 text-sm font-medium mb-3 block">I am a</Label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
                <Button
                  type="button"
                  variant={userType === 'candidate' ? 'default' : 'ghost'}
                  className={`text-sm py-2 px-3 rounded-md transition-all flex items-center justify-center ${
                    userType === 'candidate' 
                      ? 'bg-orange-500 text-white shadow-sm' 
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => setUserType('candidate')}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Candidate
                </Button>
                <Button
                  type="button"
                  variant={userType === 'interviewer' ? 'default' : 'ghost'}
                  className={`text-sm py-2 px-3 rounded-md transition-all flex items-center justify-center ${
                    userType === 'interviewer' 
                      ? 'bg-orange-500 text-white shadow-sm' 
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => setUserType('interviewer')}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Interviewer
                </Button>
              </div>
            </div>

            <Tabs defaultValue={mode === 'signup' ? 'signup' : 'login'} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-gray-100">
                <TabsTrigger value="login" className="text-gray-700 data-[state=active]:bg-white data-[state=active]:text-gray-900 flex items-center justify-center">Login</TabsTrigger>
                <TabsTrigger value="signup" className="text-gray-700 data-[state=active]:bg-white data-[state=active]:text-gray-900 flex items-center justify-center">Sign Up</TabsTrigger>
              </TabsList>
              {(authError || localError) && (
                <Alert variant="destructive" className="mt-4 border-red-300 bg-red-50">
                  <AlertDescription className="text-red-700">{authError || localError}</AlertDescription>
                </Alert>
              )}
              <TabsContent value="login">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="usernameOrEmail" className="text-gray-700">Username or Email</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                      <Input
                        id="usernameOrEmail"
                        type="text"
                        placeholder="Enter username or email"
                        value={loginForm.usernameOrEmail}
                        onChange={e => setLoginForm({ ...loginForm, usernameOrEmail: e.target.value })}
                        className="pl-10 border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-700">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter password"
                        value={loginForm.password}
                        onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="pl-10 border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </Button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center" 
                    disabled={loading}
                  >
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignupSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-gray-700">First Name</Label>
                      <Input
                        id="firstName"
                        type="text"
                        placeholder="Enter first name"
                        value={signupForm.firstName}
                        onChange={e => setSignupForm({ ...signupForm, firstName: e.target.value })}
                        className="border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-gray-700">Last Name</Label>
                      <Input
                        id="lastName"
                        type="text"
                        placeholder="Enter last name"
                        value={signupForm.lastName}
                        onChange={e => setSignupForm({ ...signupForm, lastName: e.target.value })}
                        className="border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-gray-700">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter username"
                      value={signupForm.username}
                      onChange={e => setSignupForm({ ...signupForm, username: e.target.value })}
                      className="border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                      required
                      minLength={3}
                      maxLength={30}
                      pattern="[a-zA-Z0-9_]+"
                      title="Username can only contain letters, numbers, and underscores"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-700">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter email"
                      value={signupForm.email}
                      onChange={e => setSignupForm({ ...signupForm, email: e.target.value })}
                      className="border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-700">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter password"
                      value={signupForm.password}
                      onChange={e => setSignupForm({ ...signupForm, password: e.target.value })}
                      className="border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                      required
                      minLength={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-gray-700">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirm password"
                      value={signupForm.confirmPassword}
                      onChange={e => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                      className="border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                      required
                      minLength={4}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center" 
                    disabled={loading}
                  >
                    {loading ? "Creating account..." : "Sign Up"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
