"use client"

import React, { useState, useCallback, useRef } from 'react'
import { Upload, File, CheckCircle, XCircle, AlertCircle, Clock, FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSupabaseAuth } from '@/context/SupabaseAuthContext'

interface ProcessingStep {
  step_name: string
  step_status: 'started' | 'completed' | 'failed' | 'skipped'
  step_message: string
  started_at: string
  completed_at?: string
  duration_ms?: number
}

interface ProcessingResult {
  jobProfileId: string
  jobProfile: any
  metrics: {
    textLength: number
    wordCount: number
    aiConfidence: number
    parametersGenerated: number
    processingTime: number
  }
}

interface JDUploadModalProps {
  onSuccess?: (result: ProcessingResult) => void
  onError?: (error: string) => void
  trigger?: React.ReactNode
}

export function JDUploadModal({ onSuccess, onError, trigger }: JDUploadModalProps) {
  const { user, token } = useSupabaseAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])
  const [result, setResult] = useState<ProcessingResult | null>(null)
  const [error, setError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollInterval = useRef<NodeJS.Timeout | null>(null)

  const supportedTypes = {
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
  }

  const maxSizeMB = 1

  const resetState = () => {
    setSelectedFile(null)
    setUploading(false)
    setProcessing(false)
    setUploadProgress(0)
    setProcessingSteps([])
    setResult(null)
    setError('')
    if (pollInterval.current) {
      clearInterval(pollInterval.current)
      pollInterval.current = null
    }
  }

  const validateFile = (file: File): string | null => {
    if (!Object.keys(supportedTypes).includes(file.type)) {
      return `Unsupported file type. Please upload PDF, TXT, or DOCX files.`
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the ${maxSizeMB}MB limit.`
    }

    return null
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }, [])

  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setSelectedFile(file)
    setError('')
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const pollProcessingStatus = async (jobProfileId: string) => {
    try {
      const response = await fetch(`/api/jd-upload/status/${jobProfileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setProcessingSteps(data.data.processingLogs)
          
          if (data.data.isComplete) {
            setProcessing(false)
            setUploadProgress(100)
            
            // Get full job profile details
            const profileResponse = await fetch(`/api/jd-upload/profile/${jobProfileId}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            })
            
            if (profileResponse.ok) {
              const profileData = await profileResponse.json()
              const result: ProcessingResult = {
                jobProfileId,
                jobProfile: profileData.data,
                metrics: {
                  textLength: profileData.data.description?.length || 0,
                  wordCount: profileData.data.description?.split(/\s+/).length || 0,
                  aiConfidence: (profileData.data.ai_confidence_score || 0) * 100,
                  parametersGenerated: profileData.data.parameters?.length || 0,
                  processingTime: profileData.data.processing_completed_at ? 
                    new Date(profileData.data.processing_completed_at).getTime() - 
                    new Date(profileData.data.processing_started_at).getTime() : 0
                }
              }
              setResult(result)
              onSuccess?.(result)
            }
            
            if (pollInterval.current) {
              clearInterval(pollInterval.current)
              pollInterval.current = null
            }
          } else if (data.data.isFailed) {
            setProcessing(false)
            setError(data.data.jobProfile.processing_error || 'Processing failed')
            onError?.(data.data.jobProfile.processing_error || 'Processing failed')
            
            if (pollInterval.current) {
              clearInterval(pollInterval.current)
              pollInterval.current = null
            }
          }
        }
      }
    } catch (error) {
      console.error('Error polling processing status:', error)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !token) return

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('jdFile', selectedFile)

      const response = await fetch('/api/jd-upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUploading(false)
        setProcessing(true)
        setUploadProgress(25)

        // Start polling for processing status
        pollInterval.current = setInterval(() => {
          pollProcessingStatus(data.data.jobProfileId)
        }, 2000) // Poll every 2 seconds

        // Initial status check
        setTimeout(() => pollProcessingStatus(data.data.jobProfileId), 500)

      } else {
        throw new Error(data.error || 'Upload failed')
      }

    } catch (error) {
      setUploading(false)
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      setError(errorMessage)
      onError?.(errorMessage)
    }
  }

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'started':
        return <Clock className="h-4 w-4 text-blue-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStepName = (stepName: string) => {
    const nameMap: Record<string, string> = {
      'file_upload': 'File Upload',
      'text_extraction': 'Text Extraction',
      'ai_analysis': 'AI Analysis',
      'parameter_generation': 'Parameter Generation'
    }
    return nameMap[stepName] || stepName
  }

  const getCurrentProgress = () => {
    if (result) return 100
    if (error) return 0
    
    const stepProgress: Record<string, number> = {
      'file_upload': 25,
      'text_extraction': 50,
      'ai_analysis': 75,
      'parameter_generation': 90
    }
    
    const completedSteps = processingSteps.filter(step => step.step_status === 'completed')
    if (completedSteps.length === 0) return uploadProgress
    
    const lastCompleted = completedSteps[completedSteps.length - 1]
    return stepProgress[lastCompleted.step_name] || uploadProgress
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Job Description
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Upload Job Description</DialogTitle>
          <DialogDescription>
            Upload a PDF, TXT, or DOCX file containing a job description. Our AI will automatically extract key information and create a 3-parameter assessment system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!selectedFile && !uploading && !processing && !result && (
            <Card
              className={`border-2 border-dashed transition-colors ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <CardContent className="p-8 text-center">
                <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">
                    Drag and drop your job description here
                  </p>
                  <p className="text-sm text-gray-500">
                    Or click to browse files
                  </p>
                  <div className="flex justify-center gap-2 text-xs text-gray-400">
                    <span>PDF</span> • <span>TXT</span> • <span>DOCX</span>
                    <span>• Max {maxSizeMB}MB</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <File className="h-4 w-4 mr-2" />
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={Object.values(supportedTypes).join(',')}
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </CardContent>
            </Card>
          )}

          {selectedFile && !uploading && !processing && !result && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="font-medium">{selectedFile.name}</p>
                      <p className="text-sm text-gray-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button onClick={handleUpload}>
                      <Upload className="h-4 w-4 mr-2" />
                      Process JD
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(uploading || processing) && (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      {uploading ? 'Uploading...' : 'Processing Job Description'}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {getCurrentProgress()}%
                    </span>
                  </div>
                  
                  <Progress value={getCurrentProgress()} className="w-full" />
                  
                  {processingSteps.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Processing Steps:</h4>
                      <div className="space-y-1">
                        {processingSteps.map((step, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            {getStepIcon(step.step_status)}
                            <span className="flex-1">{getStepName(step.step_name)}</span>
                            {step.step_status === 'completed' && step.duration_ms && (
                              <span className="text-xs text-gray-500">
                                {step.duration_ms}ms
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Processing Complete!
                </CardTitle>
                <CardDescription>
                  Your job description has been successfully processed and is ready for use.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Job Title:</span>
                    <p className="text-gray-600">{result.jobProfile.title}</p>
                  </div>
                  <div>
                    <span className="font-medium">Experience Level:</span>
                    <p className="text-gray-600">{result.jobProfile.experience_level}</p>
                  </div>
                  <div>
                    <span className="font-medium">AI Confidence:</span>
                    <p className="text-gray-600">{result.metrics.aiConfidence.toFixed(1)}%</p>
                  </div>
                  <div>
                    <span className="font-medium">Parameters Generated:</span>
                    <p className="text-gray-600">{result.metrics.parametersGenerated}</p>
                  </div>
                </div>

                <div>
                  <span className="font-medium text-sm">Tech Stack:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.jobProfile.extracted_tech_stack?.slice(0, 6).map((tech: string, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setIsOpen(false)} className="flex-1">
                    Use This Job Profile
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={resetState}
                  >
                    Upload Another
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default JDUploadModal 