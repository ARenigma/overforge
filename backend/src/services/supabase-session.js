const { supabase } = require('../config/supabase');

/**
 * Supabase Interview Session Service
 * Replaces Sequelize InterviewSession model operations
 */
class SupabaseSessionService {

  /**
   * Generate unique session code
   */
  static generateSessionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Create new interview session
   */
  static async create(sessionData) {
    // Generate unique session code
    let sessionCode;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      sessionCode = this.generateSessionCode();
      const existing = await this.findBySessionCode(sessionCode);
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Failed to generate unique session code');
    }

    const { data, error } = await supabase
      .from('interview_sessions')
      .insert([{
        ...sessionData,
        sessionCode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Find session by ID
   */
  static async findById(id) {
    // Check if this is a parameter-based session (starts with 'param-')
    if (id && id.startsWith('param-')) {
      // Handle parameter-based sessions from interview_sessions_v2
      const { data: session, error } = await supabase
        .from('interview_sessions_v2')
        .select('*')
        .eq('session_id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!session) {
        return null;
      }

      // Fetch interviewer and candidate data separately to avoid foreign key issues
      const [interviewerData, candidateData] = await Promise.all([
        session.interviewer_id ? supabase
          .from('Users')
          .select('id, firstName, lastName, email, role')
          .eq('id', session.interviewer_id)
          .single() : { data: null, error: null },
        session.candidate_id ? supabase
          .from('Users')
          .select('id, firstName, lastName, email, role')
          .eq('id', session.candidate_id)
          .single() : { data: null, error: null }
      ]);

      return {
        ...session,
        interviewer: interviewerData.data,
        candidate: candidateData.data
      };
    }

    // Handle legacy sessions from interview_sessions
    const { data, error } = await supabase
      .from('interview_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Fetch interviewer and candidate data separately to avoid foreign key issues
    const [interviewerData, candidateData] = await Promise.all([
      data.interviewerId ? supabase
        .from('Users')
        .select('id, firstName, lastName, email, role')
        .eq('id', data.interviewerId)
        .single() : { data: null, error: null },
      data.candidateId ? supabase
        .from('Users')
        .select('id, firstName, lastName, email, role')
        .eq('id', data.candidateId)
        .single() : { data: null, error: null }
    ]);

    return {
      ...data,
      interviewer: interviewerData.data,
      candidate: candidateData.data
    };
  }

  /**
   * Find session by session code
   */
  static async findBySessionCode(sessionCode) {
    const { data, error } = await supabase
      .from('interview_sessions')
      .select(`
        *,
        interviewer:Users!interview_sessions_interviewerId_fkey(id, firstName, lastName, email, role),
        candidate:Users!interview_sessions_candidateId_fkey(id, firstName, lastName, email, role)
      `)
      .eq('sessionCode', sessionCode)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Find sessions by interviewer ID
   */
  static async findByInterviewerId(interviewerId, filters = {}) {
    let query = supabase
      .from('interview_sessions')
      .select(`
        *,
        interviewer:Users!interview_sessions_interviewerId_fkey(id, firstName, lastName, email, role),
        candidate:Users!interview_sessions_candidateId_fkey(id, firstName, lastName, email, role)
      `)
      .eq('interviewerId', interviewerId);

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.language) {
      query = query.eq('language', filters.language);
    }

    // Order by creation date (newest first)
    query = query.order('createdAt', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Find sessions by candidate ID
   */
  static async findByCandidateId(candidateId, filters = {}) {
    let query = supabase
      .from('interview_sessions')
      .select(`
        *,
        interviewer:Users!interview_sessions_interviewerId_fkey(id, firstName, lastName, email, role),
        candidate:Users!interview_sessions_candidateId_fkey(id, firstName, lastName, email, role)
      `)
      .eq('candidateId', candidateId);

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    // Order by creation date (newest first)
    query = query.order('createdAt', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Find public sessions
   */
  static async findPublicSessions(filters = {}) {
    // First, get sessions without the relationship to avoid foreign key issues
    let query = supabase
      .from('interview_sessions')
      .select('*')
      .eq('isPublic', true);

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.language) {
      query = query.eq('language', filters.language);
    }
    if (filters.experienceLevel) {
      query = query.eq('experienceLevel', filters.experienceLevel);
    }

    // Order by creation date (newest first)
    query = query.order('createdAt', { ascending: false });

    const { data: sessions, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // If we have sessions, fetch interviewer data separately
    if (sessions && sessions.length > 0) {
      const interviewerIds = [...new Set(sessions.map(s => s.interviewerId))];
      
      const { data: interviewers, error: userError } = await supabase
        .from('Users')
        .select('id, firstName, lastName, email, role, organization')
        .in('id', interviewerIds);

      if (!userError && interviewers) {
        // Map interviewer data to sessions
        const interviewerMap = interviewers.reduce((acc, interviewer) => {
          acc[interviewer.id] = interviewer;
          return acc;
        }, {});

        return sessions.map(session => ({
          ...session,
          interviewer: interviewerMap[session.interviewerId] || null
        }));
      }
    }

    return sessions || [];
  }

  /**
   * Find all sessions (admin function)
   */
  static async findAll(filters = {}) {
    let query = supabase
      .from('interview_sessions')
      .select(`
        *,
        interviewer:Users!interview_sessions_interviewerId_fkey(id, firstName, lastName, email, role),
        candidate:Users!interview_sessions_candidateId_fkey(id, firstName, lastName, email, role)
      `);

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.language) {
      query = query.eq('language', filters.language);
    }
    if (filters.experienceLevel) {
      query = query.eq('experienceLevel', filters.experienceLevel);
    }

    // Order by creation date (newest first)
    query = query.order('createdAt', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Update session
   */
  static async update(id, updateData) {
    const { data, error } = await supabase
      .from('interview_sessions')
      .update({
        ...updateData,
        updatedAt: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Update session status
   */
  static async updateStatus(id, status) {
    const validStatuses = ['created', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const updateData = { status };
    
    // Add timestamp for specific status changes
    if (status === 'active') {
      updateData.startedAt = new Date().toISOString();
    } else if (status === 'completed') {
      updateData.completedAt = new Date().toISOString();
    }

    return this.update(id, updateData);
  }

  /**
   * Assign candidate to session
   */
  static async assignCandidate(sessionId, candidateId) {
    return this.update(sessionId, { candidateId });
  }

  /**
   * Update assessment data
   */
  static async updateAssessment(id, assessmentData) {
    return this.update(id, {
      extractedParameters: assessmentData.extractedParameters,
      mainProblem: assessmentData.mainProblem,
      finalScore: assessmentData.finalScore,
      assessmentData: assessmentData
    });
  }

  /**
   * Delete session
   */
  static async delete(id) {
    const { error } = await supabase
      .from('interview_sessions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return true;
  }

  /**
   * Count sessions
   */
  static async count(filters = {}) {
    let query = supabase
      .from('interview_sessions')
      .select('id', { count: 'exact' });

    // Apply filters
    if (filters.interviewerId) {
      query = query.eq('interviewerId', filters.interviewerId);
    }
    if (filters.candidateId) {
      query = query.eq('candidateId', filters.candidateId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return count;
  }

  /**
   * Check if candidate can join session
   */
  static canCandidateJoin(session, candidateEmail) {
    if (session.isPublic) return true;
    if (!session.allowedCandidateEmails) return false;
    return session.allowedCandidateEmails.includes(candidateEmail);
  }

  /**
   * Get interviewer URL
   */
  static getInterviewerUrl(session) {
    return `/room/${session.sessionCode}?role=interviewer&jobDescription=${encodeURIComponent(session.jobDescription)}`;
  }

  /**
   * Get candidate URL
   */
  static getCandidateUrl(session) {
    return `/room/${session.sessionCode}?role=candidate`;
  }

  /**
   * Check if session is active
   */
  static isActive(session) {
    return session.status === 'active';
  }

  /**
   * Check if session is completed
   */
  static isCompleted(session) {
    return session.status === 'completed';
  }

  /**
   * Get session statistics
   */
  static async getStatistics(interviewerId = null) {
    let query = supabase
      .from('interview_sessions')
      .select('status');

    if (interviewerId) {
      query = query.eq('interviewerId', interviewerId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    const stats = {
      total: data.length,
      created: 0,
      active: 0,
      completed: 0,
      cancelled: 0
    };

    data.forEach(session => {
      stats[session.status]++;
    });

    return stats;
  }
}

module.exports = SupabaseSessionService; 