"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Zap, 
  Code, 
  Terminal, 
  Globe, 
  ArrowRight, 
  Sparkles, 
  Container,
  MonitorSpeaker
} from "lucide-react"

export default function InterfaceSwitcher() {
  const router = useRouter()
  const params = useParams()
  const roomId = params?.id as string

  // Get current query parameters to preserve them
  const getCurrentParams = () => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      searchParams.set('skipChoose', 'true') // Add skipChoose for original interface
      return searchParams.toString()
    }
    return 'skipChoose=true'
  }

  const getEnhancedParams = () => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      // Remove skipChoose since enhanced interface doesn't need it
      searchParams.delete('skipChoose')
      return searchParams.toString()
    }
    return ''
  }

  const handleOriginalInterface = () => {
    const params = getCurrentParams()
    router.push(`/room/${roomId}?${params}`)
  }

  const handleEnhancedInterface = () => {
    const params = getEnhancedParams()
    const url = params ? `/room/${roomId}/enhanced?${params}` : `/room/${roomId}/enhanced`
    router.push(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Choose Your Interview Experience
          </h1>
          <p className="text-gray-600">
            Room: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{roomId}</span>
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Original Interface */}
          <Card className="border-2 hover:border-blue-200 transition-all duration-200 cursor-pointer group">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5 text-blue-600" />
                  Original Interface
                </CardTitle>
                <Badge variant="secondary">Stable</Badge>
              </div>
              <CardDescription>
                Full-featured interview platform with advanced assessment capabilities
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Living AI Interviewer (LHIS) System</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>3-Parameter Assessment Framework</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Advanced Code Validation</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Real-time Collaboration</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Video Call Integration</span>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs text-gray-500 mb-3">
                  Perfect for comprehensive technical interviews with AI-powered assessment
                </p>
                <Button 
                  onClick={handleOriginalInterface}
                  className="w-full group-hover:bg-blue-600 transition-colors"
                  variant="outline"
                >
                  Use Original Interface
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Interface */}
          <Card className="border-2 border-purple-200 hover:border-purple-300 transition-all duration-200 cursor-pointer group bg-gradient-to-br from-purple-50 to-blue-50">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  Enhanced Interface
                </CardTitle>
                <Badge variant="default" className="bg-purple-600">
                  <Zap className="h-3 w-3 mr-1" />
                  New
                </Badge>
              </div>
              <CardDescription>
                Modern 3-panel layout with production containers and live web preview
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="flex items-center gap-1">
                    <Container className="h-3 w-3" />
                    Production Docker Containers
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Live Web Preview
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="flex items-center gap-1">
                    <Terminal className="h-3 w-3" />
                    Enhanced Console Output
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>Framework-Specific Environments</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="flex items-center gap-1">
                    <MonitorSpeaker className="h-3 w-3" />
                    Responsive Preview Modes
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                  <p className="text-xs text-yellow-800">
                    <strong>New:</strong> Framework problems run in isolated Docker containers with live web preview
                  </p>
                </div>
                <Button 
                  onClick={handleEnhancedInterface}
                  className="w-full bg-purple-600 hover:bg-purple-700 group-hover:bg-purple-700 transition-colors"
                >
                  Try Enhanced Interface
                  <Sparkles className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feature Comparison */}
        <div className="mt-8 bg-white rounded-lg border shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Feature Comparison</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Code Execution</h4>
              <div className="space-y-1 text-gray-600">
                <div>• <strong>Original:</strong> Judge0 + Mock containers</div>
                <div>• <strong>Enhanced:</strong> Production Docker containers</div>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Output Display</h4>
              <div className="space-y-1 text-gray-600">
                <div>• <strong>Original:</strong> Basic console in sidebar</div>
                <div>• <strong>Enhanced:</strong> Dedicated console panel</div>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Web Preview</h4>
              <div className="space-y-1 text-gray-600">
                <div>• <strong>Original:</strong> Not available</div>
                <div>• <strong>Enhanced:</strong> Live iframe preview</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            You can switch between interfaces at any time. Both support the same core features.
          </p>
        </div>
      </div>
    </div>
  )
} 