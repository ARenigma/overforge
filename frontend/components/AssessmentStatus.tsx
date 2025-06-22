"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle, Circle, Clock } from "lucide-react"

interface AssessmentStatusProps {
  assessmentStatus: any
  isAssessmentMode: boolean
  awaitingParameterAnswer: boolean
  currentParameterQuestion: any
}

export function AssessmentStatus({ 
  assessmentStatus, 
  isAssessmentMode, 
  awaitingParameterAnswer, 
  currentParameterQuestion 
}: AssessmentStatusProps) {
  if (!isAssessmentMode || !assessmentStatus) {
    return null
  }

  const { parameters, currentParameterIndex } = assessmentStatus
  const completedParameters = parameters?.filter((p: any) => p.completed) || []

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2">
        {/* Compact Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">🎯 Depth Assessment</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-orange-300 rounded-full"></div>
            <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="text-xs text-gray-600">
          Overall Progress: <span className="font-medium">{completedParameters.length}/{parameters?.length || 0}</span> Parameters
        </div>

        {/* Current Activity */}
        {awaitingParameterAnswer && currentParameterQuestion && (
          <div className="bg-orange-50 border border-orange-200 rounded p-2">
            <div className="flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3 text-orange-600" />
              <span className="font-medium text-orange-800">
                Assessing: {currentParameterQuestion.parameterName?.split(' ')[0]}...
              </span>
            </div>
            <p className="text-xs text-orange-700 mt-1">
              Please answer in chat
            </p>
          </div>
        )}

        {/* Compact Parameter List */}
        {parameters && parameters.length > 0 && (
          <div className="space-y-1">
            {parameters.slice(0, 3).map((parameter: any, index: number) => (
              <div
                key={parameter.id || index}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-1">
                  {parameter.completed ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : index === currentParameterIndex ? (
                    <Clock className="h-3 w-3 text-orange-500 animate-pulse" />
                  ) : (
                    <Circle className="h-3 w-3 text-gray-400" />
                  )}
                  <span className="truncate max-w-[120px]">{parameter.name?.split(' ')[0]}</span>
                </div>
                
                {/* Progress dots */}
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((depth) => (
                    <div
                      key={depth}
                      className={`w-1.5 h-1.5 rounded-full ${
                        parameter.current_depth > depth
                          ? 'bg-green-500'
                          : parameter.current_depth === depth && index === currentParameterIndex
                          ? 'bg-orange-500'
                          : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
            {parameters.length > 3 && (
              <div className="text-xs text-gray-500 text-center">
                +{parameters.length - 3} more parameters
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 