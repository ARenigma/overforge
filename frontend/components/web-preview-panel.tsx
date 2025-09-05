"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Globe, 
  ExternalLink, 
  RefreshCw, 
  Maximize2, 
  Minimize2,
  AlertCircle,
  Monitor,
  Smartphone,
  Tablet,
  RotateCcw
} from "lucide-react"

interface SessionContainer {
  sessionId: string;
  framework: string;
  status: string;
  webUrl?: string;
  port?: number;
  resourceLimits?: {
    cpus: string;
    memory: string;
    timeout: number;
  };
}

interface WebPreviewPanelProps {
  container?: SessionContainer | null;
  isCreating?: boolean;
  error?: string | null;
  framework?: string;
  className?: string;
}

type ViewportSize = 'desktop' | 'tablet' | 'mobile'

export default function WebPreviewPanel({
  container,
  isCreating = false,
  error,
  framework,
  className = ""
}: WebPreviewPanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewportSize, setViewportSize] = useState<ViewportSize>('desktop')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (container?.webUrl) {
      // Basic URL validation
      try {
        const url = new URL(container.webUrl);
        setPreviewUrl(url.toString());
      } catch (e) {
        console.error("Invalid preview URL:", container.webUrl);
        setPreviewUrl(null);
      }
    } else {
      setPreviewUrl(null);
    }
  }, [container?.webUrl]);

  const needsContainer = framework && framework !== 'none';
  const hasWebUrl = container && container.webUrl

  // Auto-refresh iframe when container status changes
  useEffect(() => {
    if (container && container.status === 'running' && container.webUrl) {
      setIframeKey(prev => prev + 1)
    }
  }, [container?.status, container?.webUrl])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setIframeKey(prev => prev + 1)
    
    // Reset refreshing state after a delay
    setTimeout(() => {
      setIsRefreshing(false)
    }, 1000)
  }

  const handleOpenInNewTab = () => {
    if (container?.webUrl) {
      window.open(container.webUrl, '_blank')
    }
  }

  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  const getViewportDimensions = () => {
    switch (viewportSize) {
      case 'mobile': return { width: '375px', height: '667px' }
      case 'tablet': return { width: '768px', height: '1024px' }
      default: return { width: '100%', height: '100%' }
    }
  }

  const getFrameworkInfo = () => {
    const frameworkConfig = {
      'django': { 
        name: 'Django', 
        port: 8000, 
        description: 'Python web framework',
        color: 'bg-green-500'
      },
      'express': { 
        name: 'Express.js', 
        port: 3000, 
        description: 'Node.js web framework',
        color: 'bg-yellow-500'
      },
      'spring boot': { 
        name: 'Spring Boot', 
        port: 8080, 
        description: 'Java web framework',
        color: 'bg-blue-500'
      },
      'react': { 
        name: 'React', 
        port: 3000, 
        description: 'JavaScript UI library',
        color: 'bg-cyan-500'
      },
      'vue': { 
        name: 'Vue.js', 
        port: 3000, 
        description: 'JavaScript UI framework',
        color: 'bg-emerald-500'
      }
    }
    
    return frameworkConfig[framework as keyof typeof frameworkConfig] || {
      name: framework || 'Unknown',
      port: 3000,
      description: 'Web framework',
      color: 'bg-gray-500'
    }
  }

  const frameworkInfo = getFrameworkInfo()

  return (
    <Card className={`flex flex-col h-full ${className} ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        {previewUrl ? (
          /* Web Preview */
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            {viewportSize !== 'desktop' ? (
              /* Responsive Preview with viewport frame */
              <div 
                className="bg-white shadow-lg rounded-lg overflow-hidden border"
                style={getViewportDimensions()}
              >
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="Web Preview"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              </div>
            ) : (
              /* Full Desktop Preview */
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={previewUrl}
                className="w-full h-full border-0"
                title="Web Preview"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Monitor className="h-12 w-12 mx-auto text-gray-400" />
              <div>
                <h3 className="font-medium text-gray-900">No active preview</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Run your code to see the web preview here.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert className="m-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
} 