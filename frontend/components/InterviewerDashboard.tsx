"use client"

import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle, Clock, Target, SkipForward, Download } from "lucide-react"
import { JDUploadModal } from "./jd-upload-modal"

interface Parameter {
  name: string
  description: string
  depth_levels: string[]
  current_depth: number
  score: number
  max_score: number
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
}

interface AssessmentState {
  sessionId: string
  phase: string
  totalScore: number
  maxScore: number
  parameters: Parameter[]
  currentParameterIndex: number
  mainProblem: string
  candidateCode: string
  language: string
  startTime: number
  lastActivity: number
}

interface InterviewerDashboardProps {
  roomId: string
  socket: any
  assessmentState?: AssessmentState
  candidateInfo: {
    name: string
    language: string
    experienceLevel: string
  }
}

export function InterviewerDashboard({ 
  roomId, 
  socket, 
  assessmentState: initialAssessmentState,
  candidateInfo 
}: InterviewerDashboardProps) {
  const [assessmentState, setAssessmentState] = useState<AssessmentState | null>(initialAssessmentState || null)
  const [candidateCode, setCandidateCode] = useState('')
  const [elapsedTime, setElapsedTime] = useState(0)
  const [currentPhase, setCurrentPhase] = useState('foundation')
  const [assessmentHistory, setAssessmentHistory] = useState<any[]>([])

  
  // Update local state when props change
  useEffect(() => {
    if (initialAssessmentState) {
      setAssessmentState(initialAssessmentState)
    }
  }, [initialAssessmentState])

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return

    socket.on('assessmentInitialized', (data: any) => {
      setAssessmentState(data.assessmentState)
      setCurrentPhase(data.assessmentState.phase)
    })

    socket.on('assessmentFeedback', (data: any) => {
      setAssessmentHistory(prev => [...prev, {
        timestamp: Date.now(),
        action: 'feedback',
        message: data.message,
        details: data.details
      }])
    })

    socket.on('codeChange', (data: any) => {
      setCandidateCode(data.code)
      setAssessmentHistory(prev => [...prev, {
        timestamp: Date.now(),
        action: 'code_change',
        message: 'Code updated',
        details: `${data.code.length} characters`
      }])
    })

    socket.on('assessmentComplete', (data: any) => {
      setAssessmentHistory(prev => [...prev, {
        timestamp: Date.now(),
        action: 'complete',
        message: 'Assessment completed',
        details: `Final Score: ${data.finalScore}/${data.maxScore}`
      }])
      setCurrentPhase('complete')
    })

    socket.on('parameterSkipConfirmed', (data: any) => {
      setAssessmentHistory(prev => [...prev, {
        timestamp: Date.now(),
        action: 'parameter_skipped',
        message: `Parameter "${data.skippedParameter}" skipped`,
        details: data.message
      }])
      
      // Update current phase if provided
      if (data.newPhase) {
        setCurrentPhase(data.newPhase)
      }
    })

    socket.on('interviewEndConfirmed', (data: any) => {
      setAssessmentHistory(prev => [...prev, {
        timestamp: Date.now(),
        action: 'interview_ended',
        message: 'Interview ended by interviewer',
        details: `Final Score: ${data.finalScore}/${data.maxScore}, Duration: ${data.completionTime} minutes`
      }])
      
      setCurrentPhase('complete')
    })

    // Error handlers
    socket.on('skipError', (data: any) => {
      setAssessmentHistory(prev => [...prev, {
        timestamp: Date.now(),
        action: 'error',
        message: `Skip Error: ${data.message}`,
        details: 'Failed to skip parameter'
      }])
    })

    socket.on('endInterviewError', (data: any) => {
      setAssessmentHistory(prev => [...prev, {
        timestamp: Date.now(),
        action: 'error',
        message: `End Interview Error: ${data.message}`,
        details: 'Failed to end interview'
      }])
    })

    return () => {
      socket.off('assessmentInitialized')
      socket.off('assessmentFeedback')
      socket.off('codeChange')
      socket.off('assessmentComplete')
      socket.off('parameterSkipConfirmed')
      socket.off('interviewEndConfirmed')
      socket.off('skipError')
      socket.off('endInterviewError')
    }
  }, [socket])

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'foundation': return 'bg-blue-500'
      case 'parameter_1': return 'bg-green-500'
      case 'parameter_2': return 'bg-yellow-500'
      case 'parameter_3': return 'bg-purple-500'
      case 'complete': return 'bg-gray-500'
      default: return 'bg-gray-400'
    }
  }

  const getParameterStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'in_progress': return <Clock className="w-4 h-4 text-blue-500" />
      case 'skipped': return <SkipForward className="w-4 h-4 text-gray-500" />
      default: return <Target className="w-4 h-4 text-gray-400" />
    }
  }

  const handleSkipParameter = () => {
    socket.emit('skipCurrentParameter', { roomId })
  }

  const handleEndInterview = () => {
    socket.emit('endInterview', { roomId })
  }

  const handleExportResults = () => {
    if (!assessmentState) return
    
    const results = {
      sessionId: assessmentState.sessionId,
      candidate: candidateInfo,
      assessment: {
        totalScore: assessmentState.totalScore,
        maxScore: assessmentState.maxScore,
        parameters: assessmentState.parameters,
        phase: assessmentState.phase,
        duration: elapsedTime,
        mainProblem: assessmentState.mainProblem,
        finalCode: candidateCode
      },
      history: assessmentHistory,
      timestamp: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `interview-results-${assessmentState.sessionId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Handle JD upload success
  const handleJDUploadSuccess = (result: any) => {
    setAssessmentHistory(prev => [...prev, {
      timestamp: Date.now(),
      action: 'jd_uploaded',
      message: `New job profile created: ${result.jobProfile.title}`,
      details: `AI Confidence: ${result.metrics.aiConfidence}%, Parameters: ${result.metrics.parametersGenerated}`
    }])
  }

  // Handle JD upload error
  const handleJDUploadError = (error: string) => {
    setAssessmentHistory(prev => [...prev, {
      timestamp: Date.now(),
      action: 'error',
      message: `JD Upload Failed: ${error}`,
      details: 'Failed to process job description'
    }])
  }

  if (!assessmentState) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No active assessment session. Waiting for candidate to join...
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const currentParameter = assessmentState.parameters[assessmentState.currentParameterIndex]
  const overallProgress = (assessmentState.totalScore / assessmentState.maxScore) * 100

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviewer Dashboard</h1>
          <p className="text-gray-600">Real-time assessment monitoring and control</p>
            </div>
        <div className="flex gap-2">
            <JDUploadModal
              onSuccess={handleJDUploadSuccess}
              onError={handleJDUploadError}
              trigger={
                <Button variant="outline">
                  Upload New JD
                </Button>
              }
            />
            <Button
            onClick={handleExportResults}
            variant="outline"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Results
            </Button>
          </div>
        </div>

        {/* Candidate Info */}
          <Card>
        <CardHeader>
          <CardTitle>Candidate Information</CardTitle>
            </CardHeader>
            <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-medium">{candidateInfo.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Language</p>
              <p className="font-medium">{candidateInfo.language}</p>
                </div>
            <div>
              <p className="text-sm text-gray-600">Experience</p>
              <p className="font-medium">{candidateInfo.experienceLevel}</p>
                </div>
              </div>
            </CardContent>
          </Card>

      {/* Assessment Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Overall Score</p>
                <p className="text-2xl font-bold">{assessmentState.totalScore}/{assessmentState.maxScore}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <Progress value={overallProgress} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Current Phase</p>
                <p className="text-lg font-medium capitalize">{currentPhase.replace('_', ' ')}</p>
              </div>
              <div className={`w-12 h-12 rounded-full ${getPhaseColor(currentPhase)} flex items-center justify-center`}>
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Parameters</p>
                <p className="text-2xl font-bold">{assessmentState.parameters.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Duration</p>
                <p className="text-2xl font-bold">{formatTime(elapsedTime)}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Parameters */}
          <Card>
        <CardHeader>
          <CardTitle>Assessment Parameters</CardTitle>
            </CardHeader>
        <CardContent>
          <div className="space-y-4">
              {assessmentState.parameters.map((param, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getParameterStatusIcon(param.status)}
                    <h3 className="font-medium">{param.name}</h3>
                    <Badge variant={param.status === 'completed' ? 'default' : 'secondary'}>
                      {param.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600">
                    Depth: {param.current_depth + 1}/3
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{param.description}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-600">Score: </span>
                    <span className="font-medium">{param.score}/{param.max_score}</span>
                  </div>
                </div>
                </div>
              ))}
          </div>
          
          <div className="mt-6 flex gap-2">
              <Button 
                onClick={handleSkipParameter}
                variant="outline"
              disabled={currentPhase === 'complete'}
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip Current Parameter
              </Button>
            <Button 
              onClick={handleEndInterview}
              variant="destructive"
              disabled={currentPhase === 'complete'}
            >
              End Interview
            </Button>
        </div>
                </CardContent>
              </Card>

      {/* Assessment History */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment History</CardTitle>
                </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {assessmentHistory.length === 0 ? (
              <p className="text-gray-500 text-sm">No assessment history yet</p>
            ) : (
              assessmentHistory.slice(-10).reverse().map((entry, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <div>
                    <p className="text-sm font-medium">{entry.message}</p>
                    <p className="text-xs text-gray-500">{entry.details}</p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
              ))
                      )}
                    </div>
                </CardContent>
              </Card>


    </div>
  )
} 