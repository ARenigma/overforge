"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Play, Pause, RotateCcw } from 'lucide-react'

interface Question {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  estimatedTime: number
  topics: string[]
}

const mockQuestions: Record<string, Question[]> = {
  python: [
    {
      id: "py-1",
      title: "Sum of Array Elements",
      description: "Write a function that takes an array of numbers and returns their sum.",
      difficulty: "easy",
      estimatedTime: 10,
      topics: ["arrays", "loops"]
    },
    {
      id: "py-2", 
      title: "Reverse String",
      description: "Write a function that reverses a string without using built-in reverse methods.",
      difficulty: "easy",
      estimatedTime: 8,
      topics: ["strings", "loops"]
    },
    {
      id: "py-3",
      title: "Two Sum Problem",
      description: "Given an array of integers and a target sum, return indices of two numbers that add up to the target.",
      difficulty: "medium",
      estimatedTime: 20,
      topics: ["arrays", "hash maps"]
    },
    {
      id: "py-4",
      title: "LRU Cache Implementation",
      description: "Design and implement a Least Recently Used (LRU) cache with get and put operations in O(1) time.",
      difficulty: "hard",
      estimatedTime: 35,
      topics: ["data structures", "hash maps", "linked lists"]
    },
    {
      id: "py-5",
      title: "List Comprehension",
      description: "Write a list comprehension that generates even numbers from 1 to 20.",
      difficulty: "easy",
      estimatedTime: 5,
      topics: ["list comprehension", "conditionals"]
    },
    {
      id: "py-6",
      title: "Binary Search",
      description: "Implement binary search algorithm to find an element in a sorted array.",
      difficulty: "medium",
      estimatedTime: 15,
      topics: ["algorithms", "searching", "arrays"]
    },
    {
      id: "py-7",
      title: "Decorator Function",
      description: "Create a decorator that measures and prints the execution time of a function.",
      difficulty: "medium",
      estimatedTime: 18,
      topics: ["decorators", "functions", "time measurement"]
    }
  ],
  javascript: [
    {
      id: "js-1",
      title: "Array Sum",
      description: "Write a function that calculates the sum of all numbers in an array using reduce.",
      difficulty: "easy",
      estimatedTime: 8,
      topics: ["arrays", "reduce", "functions"]
    }
  ],
  java: [
    {
      id: "java-1",
      title: "ArrayList Operations",
      description: "Create a program that demonstrates adding, removing, and searching elements in an ArrayList.",
      difficulty: "easy",
      estimatedTime: 12,
      topics: ["collections", "ArrayList", "loops"]
    }
  ]
}

interface AIQuestionModalProps {
  isOpen: boolean
  onCloseAction: () => void
  language: string
  experienceLevel: string
  onTimerPauseAction?: () => void
  onTimerResumeAction?: () => void
  roomId?: string
  socket?: any
}

export default function AIQuestionModal({
  isOpen,
  onCloseAction,
  language,
  experienceLevel,
  onTimerPauseAction,
  onTimerResumeAction,
  roomId,
  socket: propSocket,
}: AIQuestionModalProps) {
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [isTimerPaused, setIsTimerPaused] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const getQuestionsForLanguage = (lang: string): Question[] => {
    return mockQuestions[lang.toLowerCase()] || mockQuestions.python
  }

  const filterQuestionsByExperience = (questions: Question[]): Question[] => {
    const difficultyMap = {
      'beginner': ['easy'],
      'junior': ['easy', 'medium'],
      'intermediate': ['medium'],
      'senior': ['medium', 'hard'],
      'expert': ['hard']
    }
    
    const allowedDifficulties = difficultyMap[experienceLevel as keyof typeof difficultyMap] || ['medium']
    return questions.filter(q => allowedDifficulties.includes(q.difficulty))
  }

  const generateQuestion = () => {
    setIsGenerating(true)
    
    // Simulate AI generation delay
    setTimeout(() => {
      const questions = getQuestionsForLanguage(language)
      const filtered = filterQuestionsByExperience(questions)
      
      if (filtered.length > 0) {
        const randomQuestion = filtered[Math.floor(Math.random() * filtered.length)]
        setCurrentQuestion(randomQuestion)
      }
      
      setIsGenerating(false)
    }, 1500)
  }

  useEffect(() => {
    if (isOpen && !currentQuestion) {
      generateQuestion()
    }
  }, [isOpen, language, experienceLevel])

  const handleTimerToggle = () => {
    if (isTimerPaused) {
      onTimerResumeAction?.()
    } else {
      onTimerPauseAction?.()
    }
    setIsTimerPaused(!isTimerPaused)
  }

  const handleClose = () => {
    if (isTimerPaused) {
      onTimerResumeAction?.()
    }
    onCloseAction()
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-700'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      case 'hard': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>AI-Generated Question</span>
            <Badge variant="outline" className="capitalize">
              {language} • {experienceLevel}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isGenerating ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              <span className="ml-3 text-gray-600">Generating question...</span>
            </div>
          ) : currentQuestion ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{currentQuestion.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={getDifficultyColor(currentQuestion.difficulty)}>
                      {currentQuestion.difficulty}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {currentQuestion.estimatedTime}m
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {currentQuestion.topics.map((topic, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Description:</h4>
                  <p className="text-gray-700 leading-relaxed">
                    {currentQuestion.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <Button variant="outline" onClick={handleTimerToggle}>
                    {isTimerPaused ? (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Resume Timer
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Pause Timer
                      </>
                    )}
                  </Button>

                  <div className="space-x-2">
                    <Button variant="outline" onClick={generateQuestion}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      New Question
                    </Button>
                    <Button onClick={handleClose}>Start Coding</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No questions available for this configuration.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
