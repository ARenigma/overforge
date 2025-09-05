# LHIS Timing Configuration System

## Overview

The Living Human-like Interview System (LHIS) now includes a comprehensive timing configuration system that allows you to control all timing aspects of the AI interviewer's behavior. This system provides flexibility for different environments and use cases.

## Configuration Structure

### Core Engagement Timings
- **Welcome Message Delay**: Delay after assessment initialization before sending welcome message
- **First Check-in Delay**: Time to wait before the first proactive engagement
- **Proactive Check Interval**: How often to check for engagement opportunities
- **Min Engagement Interval**: Minimum time between proactive engagements

### Inactivity Thresholds
- **With Code**: Inactivity timeout when candidate is actively coding
- **No Code**: Inactivity timeout when no code has been written
- **Stuck Check**: Threshold for detecting when candidate appears stuck

### Assessment Depth Question Timings
- **Trigger Delay**: Natural pause before asking depth questions
- **Retry Delay**: Delay before providing retry guidance
- **Next Parameter Delay**: Delay before moving to next parameter

### Hint System Timings
- **Inactivity Offer Delay**: Time before offering hints due to inactivity
- **Effectiveness Check Delay**: Time to wait before checking hint effectiveness
- **Follow-up Reminder Delay**: Delay for follow-up reminders

### Response Generation Timings
- **AI Response Timeout**: Maximum time for AI response generation
- **Human-like Pause Min/Max**: Range for simulating natural human response delays
- **Typing Simulation Delay**: Delay per character to simulate typing speed

### System Timings
- **Debounce Settings**: Prevent duplicate events and API abuse
- **Session Management**: Cleanup intervals, timeouts, and heartbeat checks
- **Milestone Checks**: Time-based engagement triggers

## Environment Profiles

### Development Profile
```javascript
{
  welcomeMessageDelay: 1000,        // 1 second
  firstCheckInDelay: 30000,         // 30 seconds
  inactivityWithCode: 45000,        // 45 seconds
  inactivityNoCode: 90000,          // 1.5 minutes
  minEngagementInterval: 60000      // 1 minute
}
```
**Use Case**: Faster timings for development and testing

### Test Profile
```javascript
{
  welcomeMessageDelay: 100,         // 100ms
  firstCheckInDelay: 5000,          // 5 seconds
  inactivityWithCode: 10000,        // 10 seconds
  inactivityNoCode: 20000,          // 20 seconds
  minEngagementInterval: 15000      // 15 seconds
}
```
**Use Case**: Very fast timings for automated testing

### Production Profile
```javascript
{
  welcomeMessageDelay: 2000,        // 2 seconds
  firstCheckInDelay: 60000,         // 1 minute
  inactivityWithCode: 90000,        // 1.5 minutes
  inactivityNoCode: 180000,         // 3 minutes
  minEngagementInterval: 180000     // 3 minutes
}
```
**Use Case**: Standard production timings for optimal user experience

## Configuration Methods

### 1. Environment Variables

Set timing values in your `.env` file:

```bash
# Core Engagement Timings
LHIS_WELCOME_DELAY=2000
LHIS_FIRST_CHECKIN_DELAY=60000

# Inactivity Thresholds
LHIS_INACTIVITY_WITH_CODE=90000
LHIS_INACTIVITY_NO_CODE=180000
LHIS_STUCK_CHECK_THRESHOLD=150000

# Engagement Intervals
LHIS_MIN_ENGAGEMENT_INTERVAL=180000
LHIS_PROACTIVE_CHECK_INTERVAL=60000

# Assessment Timing
LHIS_PARAMETER_QUESTION_DELAY=2000
LHIS_RETRY_GUIDANCE_DELAY=2000
LHIS_NEXT_PARAMETER_DELAY=2000

# Hint System Timing
LHIS_HINT_OFFER_DELAY=300000
LHIS_HINT_EFFECTIVENESS_CHECK=30000
LHIS_FOLLOWUP_REMINDER_DELAY=120000

# Response Generation
LHIS_AI_RESPONSE_TIMEOUT=10000
LHIS_HUMAN_PAUSE_MIN=1000
LHIS_HUMAN_PAUSE_MAX=3000
LHIS_TYPING_SIMULATION_DELAY=100

# Session Management
LHIS_MAX_SESSION_DURATION=3600000
LHIS_SESSION_TIMEOUT_WARNING=1800000
```

### 2. Runtime API Configuration

#### Get Current Configuration
```javascript
GET /api/admin/timing-config
```

#### Get Detailed Configuration
```javascript
GET /api/admin/timing-config/detailed
```

#### Update Configuration
```javascript
PUT /api/admin/timing-config
Content-Type: application/json

{
  "welcomeMessageDelay": 1500,
  "firstCheckInDelay": 45000,
  "inactivityThresholds": {
    "withCode": 60000,
    "noCode": 120000
  }
}
```

#### Reset to Defaults
```javascript
POST /api/admin/timing-config/reset
```

#### Apply Environment Profile
```javascript
POST /api/admin/timing-config/apply-profile/development
POST /api/admin/timing-config/apply-profile/test
POST /api/admin/timing-config/apply-profile/production
```

### 3. Programmatic Access

```javascript
const timingConfig = require('./config/timingConfig');

// Get specific timing
const welcomeDelay = timingConfig.getEngagementTiming('welcome');
const inactivityTimeout = timingConfig.getEngagementTiming('inactivity', hasCode);

// Update configuration
timingConfig.updateTimings({
  welcomeMessageDelay: 1500,
  firstCheckInDelay: 45000
});

// Check if action can be performed
const canEngage = timingConfig.canPerformAction(
  lastEngagementTime, 
  'proactive_engagement', 
  hasCode
);
```

## Configuration Validation

The system includes validation for all timing values:

- **Range Validation**: Ensures values are within reasonable bounds
- **Type Validation**: Confirms all values are numbers
- **Dependency Validation**: Checks logical relationships between timings

### Validation Rules

| Setting | Min Value | Max Value | Description |
|---------|-----------|-----------|-------------|
| Welcome Delay | 0ms | 10s | Cannot be negative, max 10 seconds |
| First Check-in | 5s | 5min | Minimum 5 seconds, max 5 minutes |
| Min Engagement Interval | 30s | 10min | Prevents spam, max 10 minutes |
| Inactivity Thresholds | 10s | 30min | Reasonable bounds for inactivity |

## Usage Examples

### Quick Development Setup
```javascript
// Apply development profile for faster testing
POST /api/admin/timing-config/apply-profile/development
```

### Custom Configuration for Specific Use Case
```javascript
// Configure for short demo sessions
PUT /api/admin/timing-config
{
  "welcomeMessageDelay": 500,
  "firstCheckInDelay": 15000,
  "inactivityThresholds": {
    "withCode": 30000,
    "noCode": 60000
  },
  "session": {
    "maxSessionDuration": 600000  // 10 minutes
  }
}
```

### Production Optimization
```javascript
// Apply production profile with conservative timings
POST /api/admin/timing-config/apply-profile/production
```

## Integration with LHIS Components

### Living AI Interviewer Service
```javascript
// Uses timing config for all engagement decisions
const timeout = timingConfig.getEngagementTiming('inactivity', hasCode);
this.startHintTimer(sessionId, timeout);
```

### Assessment Socket Handler
```javascript
// Uses config for proactive engagement intervals
const interval = timingConfig.proactiveCheckInterval;
setInterval(checkEngagement, interval);
```

### Response Generation
```javascript
// Uses config for human-like delays
const delay = timingConfig.getHumanLikeDelay(messageLength);
setTimeout(sendResponse, delay);
```

## Monitoring and Debugging

### Configuration Summary
```javascript
GET /api/admin/timing-config
```
Returns human-readable summary with formatted time values.

### Detailed Configuration
```javascript
GET /api/admin/timing-config/detailed
```
Returns complete configuration object with all settings.

### Recommendations
```javascript
GET /api/admin/timing-config/recommendations
```
Returns recommended settings for each environment.

## Best Practices

### Development
- Use fast timings for quick iteration
- Set short inactivity thresholds for immediate feedback
- Enable debug logging to observe timing behavior

### Testing
- Use very fast timings for automated tests
- Ensure tests account for timing variations
- Mock timing functions for deterministic tests

### Production
- Use conservative timings for better user experience
- Monitor engagement metrics to optimize timings
- Consider user feedback when adjusting intervals

### Performance Considerations
- Shorter intervals increase CPU usage
- Very fast timings may overwhelm users
- Balance responsiveness with resource usage

## Troubleshooting

### Common Issues

**Problem**: AI interviewer is too aggressive
**Solution**: Increase `minEngagementInterval` and inactivity thresholds

**Problem**: Candidates feel abandoned
**Solution**: Decrease `firstCheckInDelay` and inactivity thresholds

**Problem**: System feels robotic
**Solution**: Increase `humanLikePauseMin/Max` and typing simulation delay

**Problem**: Performance issues
**Solution**: Increase `proactiveCheckInterval` and debounce timings

### Debug Configuration
```javascript
// Log current configuration
console.log(timingConfig.getConfigSummary());

// Check if action can be performed
const canEngage = timingConfig.canPerformAction(lastTime, actionType, hasCode);
console.log('Can engage:', canEngage);
```

## Migration from Hardcoded Timings

The system automatically migrates from hardcoded values to configuration-based timings. All existing functionality remains compatible, but now uses configurable values instead of hardcoded constants.

### Before
```javascript
setTimeout(sendWelcome, 2000); // Hardcoded
```

### After
```javascript
setTimeout(sendWelcome, timingConfig.getEngagementTiming('welcome')); // Configurable
```

## Future Enhancements

- **Adaptive Timings**: Machine learning to optimize timings based on user behavior
- **A/B Testing**: Support for testing different timing configurations
- **User Preferences**: Allow candidates to set their preferred interaction frequency
- **Context-Aware Timings**: Adjust timings based on problem complexity and candidate skill level 