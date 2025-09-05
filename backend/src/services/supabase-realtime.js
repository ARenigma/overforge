const { supabase } = require('../config/supabase')

/**
 * Supabase Real-time Service
 * Provides real-time subscriptions for interview sessions
 */
class SupabaseRealtimeService {
  constructor() {
    this.subscriptions = new Map()
  }

  /**
   * Subscribe to interview session updates
   * @param {string} sessionId - Interview session ID
   * @param {function} callback - Callback function for updates
   * @returns {object} Subscription object
   */
  subscribeToSessionUpdates(sessionId, callback) {
    const channelName = `session-${sessionId}`
    
    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interview_sessions',
        filter: `id=eq.${sessionId}`
      }, (payload) => {
        console.log(`Session ${sessionId} update:`, payload)
        callback(payload)
      })
      .subscribe((status) => {
        console.log(`Session ${sessionId} subscription status:`, status)
      })

    this.subscriptions.set(sessionId, subscription)
    return subscription
  }

  /**
   * Subscribe to user-specific updates
   * @param {number} userId - User ID
   * @param {function} callback - Callback function for updates
   * @returns {object} Subscription object
   */
  subscribeToUserUpdates(userId, callback) {
    const channelName = `user-${userId}`
    
    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Users',
        filter: `id=eq.${userId}`
      }, (payload) => {
        console.log(`User ${userId} update:`, payload)
        callback(payload)
      })
      .subscribe((status) => {
        console.log(`User ${userId} subscription status:`, status)
      })

    this.subscriptions.set(`user-${userId}`, subscription)
    return subscription
  }

  /**
   * Subscribe to all sessions for an interviewer
   * @param {number} interviewerId - Interviewer user ID
   * @param {function} callback - Callback function for updates
   * @returns {object} Subscription object
   */
  subscribeToInterviewerSessions(interviewerId, callback) {
    const channelName = `interviewer-${interviewerId}`
    
    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interview_sessions',
        filter: `interviewerId=eq.${interviewerId}`
      }, (payload) => {
        console.log(`Interviewer ${interviewerId} session update:`, payload)
        callback(payload)
      })
      .subscribe((status) => {
        console.log(`Interviewer ${interviewerId} subscription status:`, status)
      })

    this.subscriptions.set(`interviewer-${interviewerId}`, subscription)
    return subscription
  }

  /**
   * Subscribe to all sessions for a candidate
   * @param {number} candidateId - Candidate user ID
   * @param {function} callback - Callback function for updates
   * @returns {object} Subscription object
   */
  subscribeToCandidateSessions(candidateId, callback) {
    const channelName = `candidate-${candidateId}`
    
    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'interview_sessions',
        filter: `candidateId=eq.${candidateId}`
      }, (payload) => {
        console.log(`Candidate ${candidateId} session update:`, payload)
        callback(payload)
      })
      .subscribe((status) => {
        console.log(`Candidate ${candidateId} subscription status:`, status)
      })

    this.subscriptions.set(`candidate-${candidateId}`, subscription)
    return subscription
  }

  /**
   * Unsubscribe from a specific subscription
   * @param {string} key - Subscription key
   */
  unsubscribe(key) {
    const subscription = this.subscriptions.get(key)
    if (subscription) {
      supabase.removeChannel(subscription)
      this.subscriptions.delete(key)
      console.log(`Unsubscribed from ${key}`)
    }
  }

  /**
   * Unsubscribe from all subscriptions
   */
  unsubscribeAll() {
    for (const [key, subscription] of this.subscriptions) {
      supabase.removeChannel(subscription)
      console.log(`Unsubscribed from ${key}`)
    }
    this.subscriptions.clear()
  }

  /**
   * Get active subscription count
   * @returns {number} Number of active subscriptions
   */
  getActiveSubscriptionCount() {
    return this.subscriptions.size
  }

  /**
   * Broadcast a message to a specific channel
   * @param {string} channel - Channel name
   * @param {object} payload - Message payload
   */
  async broadcast(channel, payload) {
    try {
      const { error } = await supabase
        .channel(channel)
        .send({
          type: 'broadcast',
          event: 'message',
          payload
        })

      if (error) {
        console.error(`Broadcast error on channel ${channel}:`, error)
        return false
      }

      console.log(`Broadcasted to channel ${channel}:`, payload)
      return true
    } catch (error) {
      console.error(`Broadcast exception on channel ${channel}:`, error)
      return false
    }
  }
}

// Create singleton instance
const realtimeService = new SupabaseRealtimeService()

module.exports = realtimeService 