"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Brain, Play, Pause } from "lucide-react"

interface AIQuestionModalProps {
  isOpen: boolean
  onClose: () => void
  language: string
  experienceLevel: string
  onTimerPause: () => void
  onTimerResume: () => void
}

const mockQuestions: { [key: string]: { [key: string]: any[] } } = {
  javascript: {
    junior: [
      {
        title: "Array Sum",
        description: "Write a function that takes an array of numbers and returns their sum.",
        difficulty: "Easy",
        timeLimit: 15,
        hints: ["Use a loop or reduce method", "Initialize sum to 0"],
      },
      {
        title: "String Reversal",
        description: "Write a function that reverses a string without using built-in reverse methods.",
        difficulty: "Easy",
        timeLimit: 10,
        hints: ["Use a loop", "Build string from end to start"],
      },
    ],
    mid: [
      {
        title: "Two Sum Problem",
        description:
          "Given an array of integers and a target sum, return indices of two numbers that add up to the target.",
        difficulty: "Medium",
        timeLimit: 25,
        hints: ["Use a hash map for O(n) solution", "Store complements as you iterate"],
      },
    ],
    senior: [
      {
        title: "Design a Cache System",
        description: "Implement an LRU (Least Recently Used) cache with get and put operations.",
        difficulty: "Hard",
        timeLimit: 45,
        hints: ["Use doubly linked list + hash map", "Consider time complexity requirements"],
      },
    ],
  },
  python: {
    junior: [
      {
        title: "List Comprehension",
        description: "Create a list of squares of even numbers from 1 to 20 using list comprehension.",
        difficulty: "Easy",
        timeLimit: 10,
        hints: ["Use if condition in comprehension", "Range function for numbers"],
      },
    ],
    mid: [
      {
        title: "Binary Search",
        description: "Implement binary search algorithm to find an element in a sorted array.",
        difficulty: "Medium",
        timeLimit: 20,
        hints: ["Use two pointers", "Compare with middle element"],
      },
    ],
    senior: [
      {
        title: "Decorator Pattern",
        description: "Create a decorator that measures and logs the execution time of functions.",
        difficulty: "Hard",
        timeLimit: 30,
        hints: ["Use functools.wraps", "Time module for measurement"],
      },
    ],
  },
}

export default function AIQuestionModal({
  isOpen,
  onClose,
  language,
  experienceLevel,
  onTimerPause,
  onTimerResume,
}: AIQuestionModalProps) {
  const [currentQuestion, setCurrentQuestion] = useState<any>(null)
  const [isTimerPaused, setIsTimerPaused] = useState(false)

  const generateQuestion = () => {
    const questions = mockQuestions[language]?.[experienceLevel] || []
    if (questions.length > 0) {
      const randomQuestion = questions[Math.floor(Math.random() * questions.length)]
      setCurrentQuestion(randomQuestion)
    }
  }

  const handleTimerToggle = () => {
    if (isTimerPaused) {
      onTimerResume()
      setIsTimerPaused(false)
    } else {
      onTimerPause()
      setIsTimerPaused(true)
    }
  }

  const handleClose = () => {
    if (isTimerPaused) {
      onTimerResume()
      setIsTimerPaused(false)
    }
    setCurrentQuestion(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-purple-600" />
            <span>AI-Generated Question</span>
          </DialogTitle>
          <DialogDescription>
            Get a coding question tailored to your experience level and programming language
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!currentQuestion ? (
            <Card>
              <CardHeader>
                <CardTitle>Generate New Question</CardTitle>
                <CardDescription>
                  Click below to get an AI-generated coding question for {language} at {experienceLevel} level
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={generateQuestion} className="w-full">
                  <Brain className="h-4 w-4 mr-2" />
                  Generate Question
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{currentQuestion.title}</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={
                        currentQuestion.difficulty === "Easy"
                          ? "secondary"
                          : currentQuestion.difficulty === "Medium"
                            ? "default"
                            : "destructive"
                      }
                    >
                      {currentQuestion.difficulty}
                    </Badge>
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      {currentQuestion.timeLimit}m
                    </Badge>
                  </div>
                </div>
                <CardDescription>{currentQuestion.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Hints:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    {currentQuestion.hints.map((hint: string, index: number) => (
                      <li key={index}>{hint}</li>
                    ))}
                  </ul>
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
                      New Question
                    </Button>
                    <Button onClick={handleClose}>Start Coding</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
