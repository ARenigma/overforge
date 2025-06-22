// Assessment Session model for Supabase
// This is a simple data structure since we're using Supabase directly

class AssessmentSession {
  constructor(data) {
    this.id = data.id;
    this.sessionId = data.session_id;
    this.candidateId = data.candidate_id;
    this.jobProfileId = data.job_profile_id;
    this.language = data.language || 'python';
    this.experienceLevel = data.experience_level || 'intermediate';
    this.currentParameter = data.current_parameter || 0;
    this.currentDepth = data.current_depth || 0;
    this.parameterScores = data.parameter_scores || {};
    this.assessmentState = data.assessment_state || {};
    this.codeProgress = data.code_progress || {};
    this.retryCount = data.retry_count || {};
    this.overallScore = data.overall_score || 0;
    this.status = data.status || 'active';
    this.startedAt = data.started_at;
    this.completedAt = data.completed_at;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  // Convert to database format
  toDatabase() {
    return {
      session_id: this.sessionId,
      candidate_id: this.candidateId,
      job_profile_id: this.jobProfileId,
      language: this.language,
      experience_level: this.experienceLevel,
      current_parameter: this.currentParameter,
      current_depth: this.currentDepth,
      parameter_scores: this.parameterScores,
      assessment_state: this.assessmentState,
      code_progress: this.codeProgress,
      retry_count: this.retryCount,
      overall_score: this.overallScore,
      status: this.status,
      started_at: this.startedAt,
      completed_at: this.completedAt
    };
  }

  // Create from database format
  static fromDatabase(data) {
    return new AssessmentSession(data);
  }
}

module.exports = AssessmentSession; 