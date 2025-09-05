"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Plus, 
  X, 
  Copy, 
  Check, 
  ExternalLink,
  Clock,
  Users, 
  Code, 
  FileText,
  Settings,
  Loader2
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface SessionCreatorProps {
  onSessionCreated?: (session: any) => void
}

export function SessionCreator({ onSessionCreated }: SessionCreatorProps) {
  const { token } = useAuth()
  
  const [formData, setFormData] = useState({
    title: '',
    jobDescription: '',
    language: 'javascript',
    experienceLevel: 'intermediate',
    maxDuration: 60,
    isPublic: false,
    allowedCandidateEmails: [] as string[],
    notes: '',
    tags: [] as string[]
  })

  const [emailInput, setEmailInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdSession, setCreatedSession] = useState<any>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    setError('')
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSwitchChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }))
  }

  const handleNumberChange = (name: string, value: string) => {
    const numValue = parseInt(value)
    if (!isNaN(numValue)) {
      setFormData(prev => ({
        ...prev,
        [name]: numValue
      }))
    }
  }

  const addEmail = () => {
    if (emailInput.trim() && emailInput.includes('@')) {
      if (!formData.allowedCandidateEmails.includes(emailInput.trim())) {
        setFormData(prev => ({
          ...prev,
          allowedCandidateEmails: [...prev.allowedCandidateEmails, emailInput.trim()]
        }))
      }
      setEmailInput('')
    }
  }

  const removeEmail = (email: string) => {
    setFormData(prev => ({
      ...prev,
      allowedCandidateEmails: prev.allowedCandidateEmails.filter(e => e !== email)
    }))
  }

  const addTag = () => {
    if (tagInput.trim()) {
      if (!formData.tags.includes(tagInput.trim())) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, tagInput.trim()]
        }))
      }
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }))
  }

  const validateForm = () => {
    if (!formData.title.trim()) return 'Session title is required'
    if (!formData.jobDescription.trim() || formData.jobDescription.length < 50) {
      return 'Job description must be at least 50 characters'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (data.success) {
        setCreatedSession(data.data)
        if (onSessionCreated) {
          onSessionCreated(data.data)
        }
      } else {
        setError(data.error || 'Failed to create session')
      }
    } catch (err) {
      setError('Network error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedUrl(type)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const resetForm = () => {
    setCreatedSession(null)
    setFormData({
      title: '',
      jobDescription: '',
      language: 'javascript',
      experienceLevel: 'intermediate',
      maxDuration: 60,
      isPublic: false,
      allowedCandidateEmails: [],
      notes: '',
      tags: []
    })
    setError('')
  }

  if (createdSession) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <Check className="w-5 h-5" />
            Session Created Successfully!
          </CardTitle>
          <CardDescription>
            Your interview session has been created. Share the appropriate URL with your candidate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Session Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Session Code:</span>
                  <Badge variant="outline" className="ml-2">{createdSession.sessionCode}</Badge>
                </div>
                <div>
                  <span className="font-medium">Title:</span>
                  <span className="ml-2">{createdSession.session.title}</span>
                </div>
                <div>
                  <span className="font-medium">Language:</span>
                  <span className="ml-2 capitalize">{createdSession.session.language}</span>
                </div>
                <div>
                  <span className="font-medium">Experience:</span>
                  <span className="ml-2 capitalize">{createdSession.session.experienceLevel}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">Interviewer URL</Label>
                <p className="text-sm text-gray-600 mb-2">Use this URL to monitor and control the interview</p>
                <div className="flex gap-2">
                  <Input
                    value={createdSession.urls.interviewer}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(createdSession.urls.interviewer, 'interviewer')}
                  >
                    {copiedUrl === 'interviewer' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold">Candidate URL</Label>
                <p className="text-sm text-gray-600 mb-2">Share this URL with the candidate to join the session</p>
                <div className="flex gap-2">
                  <Input
                    value={createdSession.urls.candidate}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(createdSession.urls.candidate, 'candidate')}
                  >
                    {copiedUrl === 'candidate' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                onClick={() => window.open(createdSession.urls.interviewer, '_blank')}
                className="flex-1"
              >
                Start Interview Session
              </Button>
              <Button
                variant="outline"
                onClick={resetForm}
                className="flex-1"
              >
                Create Another Session
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Create Interview Session
        </CardTitle>
        <CardDescription>
          Set up a new 3-parameter assessment session for your candidate
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="access" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Access Control
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Session Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Frontend Developer Interview - React/TypeScript"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="jobDescription">Job Description</Label>
                <Textarea
                  id="jobDescription"
                  name="jobDescription"
                  placeholder="Paste the complete job description here. This will be used to extract 3 key parameters for assessment..."
                  value={formData.jobDescription}
                  onChange={handleInputChange}
                  required
                  disabled={isLoading}
                  rows={8}
                  className="resize-none"
                />
                <p className="text-sm text-gray-600">
                  Minimum 50 characters. The AI will analyze this to create targeted assessment parameters.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Programming Language</Label>
                  <Select
                    value={formData.language}
                    onValueChange={(value) => handleSelectChange('language', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="java">Java</SelectItem>
                      <SelectItem value="cpp">C++</SelectItem>
                      <SelectItem value="csharp">C#</SelectItem>
                      <SelectItem value="go">Go</SelectItem>
                      <SelectItem value="rust">Rust</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experienceLevel">Experience Level</Label>
                  <Select
                    value={formData.experienceLevel}
                    onValueChange={(value) => handleSelectChange('experienceLevel', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner (0-2 years)</SelectItem>
                      <SelectItem value="intermediate">Intermediate (2-5 years)</SelectItem>
                      <SelectItem value="advanced">Advanced (5+ years)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maxDuration">Maximum Duration (minutes)</Label>
                <Input
                  id="maxDuration"
                  type="number"
                  min="15"
                  max="180"
                  value={formData.maxDuration}
                  onChange={(e) => handleNumberChange('maxDuration', e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Session Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Any additional notes or instructions for this session..."
                  value={formData.notes}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Tags (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    disabled={isLoading}
                  />
                  <Button type="button" variant="outline" onClick={addTag} disabled={isLoading}>
                    Add
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => removeTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="access" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isPublic">Public Session</Label>
                  <p className="text-sm text-gray-600">Allow any candidate to join this session</p>
                </div>
                <Switch
                  id="isPublic"
                  checked={formData.isPublic}
                  onCheckedChange={(checked) => handleSwitchChange('isPublic', checked)}
                  disabled={isLoading}
                />
              </div>

              {!formData.isPublic && (
                <div className="space-y-2">
                  <Label>Allowed Candidate Emails</Label>
                  <p className="text-sm text-gray-600">
                    Only candidates with these email addresses can join the session
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="candidate@example.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                      disabled={isLoading}
                    />
                    <Button type="button" variant="outline" onClick={addEmail} disabled={isLoading}>
                      Add
                    </Button>
                  </div>
                  {formData.allowedCandidateEmails.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {formData.allowedCandidateEmails.map((email, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm">{email}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeEmail(email)}
                            disabled={isLoading}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Session...
                </>
              ) : (
                'Create Interview Session'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
} 