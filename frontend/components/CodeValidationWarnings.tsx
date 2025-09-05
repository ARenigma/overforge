import React from 'react';
import { AlertTriangle, Shield, AlertCircle, Info, X } from 'lucide-react';

interface ValidationIssue {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  details?: string;
  blockExecution?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  shouldBlock: boolean;
  securityScore: number;
  contextScore: number;
  aiModerationScore?: number;
  warnings: ValidationIssue[];
  errors: ValidationIssue[];
  suggestions: ValidationIssue[];
  timestamp: string;
  metadata?: {
    aiConfidence?: number;
    [key: string]: any;
  };
}

interface CodeValidationWarningsProps {
  validation: ValidationResult | null;
  onDismiss?: (issueType: string, index: number) => void;
  showSecurityScore?: boolean;
  showContextScore?: boolean;
  compact?: boolean;
}

const CodeValidationWarnings: React.FC<CodeValidationWarningsProps> = ({
  validation,
  onDismiss,
  showSecurityScore = true,
  showContextScore = true,
  compact = false
}) => {
  if (!validation) return null;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'medium':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'low':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'high':
        return 'border-orange-200 bg-orange-50 text-orange-800';
      case 'medium':
        return 'border-yellow-200 bg-yellow-50 text-yellow-800';
      case 'low':
        return 'border-blue-200 bg-blue-50 text-blue-800';
      case 'info':
        return 'border-gray-200 bg-gray-50 text-gray-800';
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const renderIssue = (issue: ValidationIssue, index: number, type: 'error' | 'warning' | 'suggestion') => {
    // Don't show dismiss button for relevance/context warnings that should persist
    const canDismiss = onDismiss && 
      issue.type !== 'context_mismatch' && 
      issue.type !== 'ai_context_warning' && 
      issue.type !== 'relevance' &&
      issue.type !== 'non_coding_content';
    
    return (
      <div 
        key={`${type}-${index}`}
        className={`p-3 rounded-lg border ${getSeverityColor(issue.severity)} ${compact ? 'p-2' : 'p-3'}`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2">
            {getSeverityIcon(issue.severity)}
            <div className="flex-1">
              <p className={`font-medium ${compact ? 'text-sm' : 'text-sm'}`}>
                {issue.message}
              </p>
              {issue.details && !compact && (
                <p className="text-xs mt-1 opacity-80">
                  {issue.details}
                </p>
              )}
              {issue.blockExecution && (
                <div className="flex items-center mt-2 text-xs text-red-600">
                  <Shield className="h-3 w-3 mr-1" />
                  Code execution blocked
                </div>
              )}
            </div>
          </div>
          {canDismiss && (
            <button
              onClick={() => onDismiss(type, index)}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const hasIssues = validation.errors.length > 0 || validation.warnings.length > 0;
  const hasBlockingIssues = validation.shouldBlock;

  if (!hasIssues && validation.suggestions.length === 0) {
    return (
      <div className="p-3 rounded-lg border border-green-200 bg-green-50 text-green-800">
        <div className="flex items-center space-x-2">
          <Shield className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">Code validation passed</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Security and Context Scores */}
      {(showSecurityScore || showContextScore) && !compact && (
        <div className="flex space-x-4 p-3 bg-gray-50 rounded-lg">
          {showSecurityScore && (
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-gray-600" />
              <span className="text-sm text-gray-600">Security:</span>
              <span className={`text-sm font-medium ${getScoreColor(validation.securityScore)}`}>
                {validation.securityScore}/100
              </span>
            </div>
          )}
          {showContextScore && (
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-gray-600" />
              <span className="text-sm text-gray-600">Relevance:</span>
              <span className={`text-sm font-medium ${getScoreColor(validation.contextScore)}`}>
                {validation.contextScore}/100
              </span>
            </div>
          )}
          {validation.aiModerationScore !== undefined && (
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-gray-600">AI Moderation:</span>
              <span className={`text-sm font-medium ${getScoreColor(validation.aiModerationScore)}`}>
                {validation.aiModerationScore}/100
              </span>
              {validation.metadata?.aiConfidence && (
                <span className="text-xs text-gray-500">
                  ({validation.metadata.aiConfidence}% confidence)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Blocking Issues Banner */}
      {hasBlockingIssues && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-800">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="font-medium">
              Code execution blocked due to security violations
            </span>
          </div>
        </div>
      )}

      {/* Errors */}
      {validation.errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-800 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Errors ({validation.errors.length})
          </h4>
          {validation.errors.map((error, index) => renderIssue(error, index, 'error'))}
        </div>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-orange-800 flex items-center">
            <AlertCircle className="h-4 w-4 mr-1" />
            Warnings ({validation.warnings.length})
          </h4>
          {validation.warnings.map((warning, index) => renderIssue(warning, index, 'warning'))}
        </div>
      )}

      {/* Suggestions */}
      {validation.suggestions.length > 0 && !compact && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-blue-800 flex items-center">
            <Info className="h-4 w-4 mr-1" />
            Suggestions ({validation.suggestions.length})
          </h4>
          {validation.suggestions.map((suggestion, index) => renderIssue(suggestion, index, 'suggestion'))}
        </div>
      )}
    </div>
  );
};

export default CodeValidationWarnings; 