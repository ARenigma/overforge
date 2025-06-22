// Job Profile model for Supabase
// This is a simple data structure since we're using Supabase directly

class JobProfile {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.experienceLevel = data.experience_level;
    this.parameters = data.parameters;
    this.masterProblem = data.master_problem;
    this.assessmentCriteria = data.assessment_criteria;
    this.isActive = data.is_active;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  // Convert to database format
  toDatabase() {
    return {
      title: this.title,
      description: this.description,
      experience_level: this.experienceLevel,
      parameters: this.parameters,
      master_problem: this.masterProblem,
      assessment_criteria: this.assessmentCriteria,
      is_active: this.isActive
    };
  }

  // Create from database format
  static fromDatabase(data) {
    return new JobProfile(data);
  }
}

module.exports = JobProfile; 