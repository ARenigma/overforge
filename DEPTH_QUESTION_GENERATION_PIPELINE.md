# Depth Question Generation Pipeline - Complete Flow & Optimization Guide

## 📊 Pipeline Overview

```
Frontend Code Input
    ↓
[1] Code Change Event (assessmentCodeChange)
    ↓
[2] Entry Point Validation (assessment-socket.js)
    ↓
[3] Code Quality Filters (living-ai-interviewer.js)
    ↓
[4] Parameter Detection (AI Analysis)
    ↓
[5] Question Check Logic (checkForParameterQuestion)
    ↓
[6] Question Generation (generateAIDepthQuestion)
    ↓
[7] Question Enhancement & Emission
    ↓
Frontend Display
```

---

## 🔍 Detailed Pipeline Stages

### **STAGE 1: Code Change Event Reception**
**File:** `backend/src/sockets/assessment-socket.js` (lines 82-123)

**Entry Point:** `handleCodeChange(data)`

**Input Validation:**
```javascript
✅ sessionId exists
✅ code exists
✅ code.length >= 150 chars (minimumCharacters threshold)
```

**Throttling Logic:**
- **Time-based throttling:** Minimum 1.5s (significant changes) or 4s (minor changes) between analyses
- **Significant change detection:** Checks for new functions, classes, imports, block completion, etc.
- **Early exit:** Returns immediately if throttled

**Code:**
```javascript
if (timeSinceLastAnalysis < minInterval) {
  return; // Skip analysis
}
```

**Optimization Opportunities:**
1. ⚠️ **Current:** Sequential parameter checking (stops after first detection)
2. ✅ **Optimize:** Parallel parameter detection for multi-parameter code
3. ⚠️ **Current:** Fixed throttling intervals
4. ✅ **Optimize:** Dynamic throttling based on code complexity

---

### **STAGE 2: Code Analysis & Quality Filtering**
**File:** `backend/src/services/living-ai-interviewer.js` (lines 404-503)

**Function:** `analyzeCodeProgress(sessionId, questionId, code, language)`

**Quality Filters Applied (in order):**

1. **Length Check:**
   ```javascript
   if (code.trim().length < 150) return false;
   ```

2. **Implementation Signals:**
   ```javascript
   if (requireImplementation && !stats.hasImplementationSignals) return false;
   ```
   - Checks for: function definitions, class definitions, method calls, logic operators

3. **Meaningful Lines:**
   ```javascript
   if (stats.meaningfulLines < 5) return false;
   ```
   - Excludes: empty lines, comments, imports, boilerplate

4. **Boilerplate Ratio:**
   ```javascript
   if (stats.boilerplateRatio > 0.7) return false;
   ```
   - Max 70% boilerplate allowed

**Code Storage:**
```javascript
session.currentCode[questionId] = code;
session.currentCode['latest'] = code;
```

**Optimization Opportunities:**
1. ⚠️ **Current:** All filters are hardcoded thresholds
2. ✅ **Optimize:** Make thresholds configurable per parameter type
3. ⚠️ **Current:** Single-pass analysis
4. ✅ **Optimize:** Cache analysis results to avoid re-analysis

---

### **STAGE 3: Parameter Detection (AI-Powered)**
**File:** `backend/src/services/living-ai-interviewer.js` (lines 511-603)

**Function:** `fastParameterDetection(code, parameter, language)`

**Process:**
1. **AI Prompt Construction:**
   ```
   "Analyze this {language} code to determine if it demonstrates 
   competency in '{parameter.name}'"
   ```

2. **AI Analysis Request:**
   - Timeout: 10 seconds
   - Response format: JSON with `detected`, `confidence`, `evidence`, `reasoning`

3. **Response Parsing:**
   - Handles multiple response formats (object, string with JSON, etc.)
   - Validates required fields exist

4. **Detection Threshold:**
   ```javascript
   const isDetected = result.detected && result.confidence >= 70;
   ```

**Current Behavior:**
- **Sequential processing:** Checks parameters one at a time
- **Early exit:** Stops after first parameter detected
- **Single detection:** Only one parameter can be detected per code analysis

**Optimization Opportunities:**
1. ⚠️ **Current:** Sequential AI calls (slow for multi-parameter code)
2. ✅ **Optimize:** Parallel AI calls for all parameters simultaneously
3. ⚠️ **Current:** Generic prompt for all parameters
4. ✅ **Optimize:** Parameter-specific prompts with objective criteria
5. ⚠️ **Current:** Fixed 70% confidence threshold
6. ✅ **Optimize:** Dynamic threshold based on parameter importance

---

### **STAGE 4: Question Check Logic**
**File:** `backend/src/sockets/assessment-socket.js` (lines 313-390)

**Function:** `checkForParameterQuestion(sessionId)`

**Pre-conditions:**
```javascript
✅ Session exists
✅ Not already awaiting an answer
✅ Parameter has codeDetected = true
✅ Parameter has < 3 questions asked
✅ Parameter milestone !== 'completed'
```

**Process:**
1. **Iterate through parameters:**
   ```javascript
   for (const [parameterId, progress] of Object.entries(parameterProgress)) {
     if (progress.codeDetected && 
         progress.questionsAsked.length < 3 && 
         progress.milestone !== 'completed') {
       // Generate question
     }
   }
   ```

2. **Force question logic:**
   - Time-based forcing (90s for Q2, 150s for Q3)
   - Code length-based forcing (>800 chars for Q2, >1200 chars for Q3)

3. **Question generation:**
   ```javascript
   const questionData = await livingAIInterviewer.triggerParameterAssessment(
     sessionId, 
     parseInt(parameterId)
   );
   ```

**Optimization Opportunities:**
1. ⚠️ **Current:** Only checks first eligible parameter
2. ✅ **Optimize:** Priority-based parameter selection
3. ⚠️ **Current:** Hardcoded force thresholds
4. ✅ **Optimize:** Adaptive thresholds based on code complexity

---

### **STAGE 5: Question Generation**
**File:** `backend/src/services/living-ai-interviewer.js` (lines 732-867, 2480-2700)

**Function:** `triggerParameterAssessment()` → `generateAIDepthQuestion()`

**Pre-conditions:**
```javascript
✅ Session exists
✅ Not awaiting answer
✅ Parameter exists
✅ Parameter.codeDetected = true
✅ Current depth < 3
```

**Question Generation Process:**

1. **AI Analysis Lock:**
   ```javascript
   if (this.aiAnalysisLocks.has(sessionId)) {
     return generateIntelligentFallbackQuestion();
   }
   ```

2. **Code Retrieval:**
   ```javascript
   candidateCode = session.currentCode['latest'] || 
                  session.currentCode['main'] || 
                  session.currentCode['master-problem'] || 
                  session.currentCode[Object.keys(session.currentCode)[0]];
   ```

3. **Approach & Problem Detection:**
   ```javascript
   detectedApproach = this.detectApproachUniversal(candidateCode, session.language);
   detectedProblem = this.detectProblemUniversal(candidateCode, session.language);
   ```

4. **Context Building:**
   - Retrieves stored approaches for comparison
   - Builds comprehensive prompt with code, approach, problem type

5. **AI Question Generation:**
   - Prompt includes: parameter info, depth level, code sample, detected approach
   - Timeout: 30 seconds
   - Response parsing and validation

6. **Fallback System:**
   - If AI fails → `generateIntelligentFallbackQuestion()`
   - If fallback fails → Generic template question

**Depth Levels:**
- **Depth 0:** "Approach & Logic Assessment"
- **Depth 1:** "Trade-offs & Alternatives"
- **Depth 2:** "What-if Scenarios & Adaptability"

**Optimization Opportunities:**
1. ⚠️ **Current:** Single AI call with full context (can be slow)
2. ✅ **Optimize:** Two-stage generation (quick template + AI enhancement)
3. ⚠️ **Current:** Generic fallback questions
4. ✅ **Optimize:** Parameter-specific fallback templates
5. ⚠️ **Current:** No question quality scoring
6. ✅ **Optimize:** Add quality metrics and re-generation if low quality

---

### **STAGE 6: Question Enhancement & Emission**
**File:** `backend/src/services/living-ai-interviewer.js` (lines 834-866)

**Enhancement Steps:**

1. **Conversation Threading:**
   ```javascript
   conversationCallback = this.generateConversationCallback(session, currentTopic);
   enhancedQuestion = `${conversationCallback} ${generatedQuestion}`;
   ```

2. **Personality Awareness:**
   ```javascript
   enhancedQuestion = this.generatePersonalityAwareResponse(session, enhancedQuestion);
   ```

3. **Question Metadata:**
   ```javascript
   {
     type: 'parameter_question',
     parameterId, parameterName, depthLevel,
     question: enhancedQuestion,
     questionSource: 'ai_depth_question' | 'intelligent_fallback',
     metadata: { correctAnswer, assessmentCriteria }
   }
   ```

**Emission:**
**File:** `backend/src/sockets/assessment-socket.js` (lines 350-379)

```javascript
this.io.to(sessionId).emit('newMessage', chatMessage);
```

**Optimization Opportunities:**
1. ⚠️ **Current:** All enhancements applied synchronously
2. ✅ **Optimize:** Parallel enhancement processing
3. ⚠️ **Current:** No question caching
4. ✅ **Optimize:** Cache similar questions to reduce AI calls

---

## 🎯 Critical Decision Points

### **Decision Point 1: Should we analyze this code?**
**Location:** `assessment-socket.js:86-88`

**Conditions:**
- ✅ Code length >= 150 chars
- ✅ Not throttled (time-based)
- ✅ Session exists

**Failure Point:** Code too short → No analysis → No questions

---

### **Decision Point 2: Does code pass quality filters?**
**Location:** `living-ai-interviewer.js:423-426`

**Conditions:**
- ✅ Has implementation signals (functions, classes, logic)
- ✅ >= 5 meaningful lines
- ✅ < 70% boilerplate

**Failure Point:** Code is boilerplate → No analysis → No questions

---

### **Decision Point 3: Is parameter detected?**
**Location:** `living-ai-interviewer.js:482-590`

**Conditions:**
- ✅ AI returns `detected: true`
- ✅ AI confidence >= 70%
- ✅ Parameter not already detected

**Failure Point:** Parameter not detected → `codeDetected = false` → No questions

**This is the MAIN BOTTLENECK for Stack implementation!**

---

### **Decision Point 4: Should we generate a question?**
**Location:** `assessment-socket.js:331`

**Conditions:**
- ✅ `progress.codeDetected = true`
- ✅ `progress.questionsAsked.length < 3`
- ✅ `progress.milestone !== 'completed'`
- ✅ `!session.awaitingAnswer`

**Failure Point:** Already asked 3 questions → No more questions

---

### **Decision Point 5: Can AI generate question?**
**Location:** `living-ai-interviewer.js:2490-2493`

**Conditions:**
- ✅ No concurrent AI analysis lock
- ✅ Code available in session
- ✅ AI call succeeds (or fallback available)

**Failure Point:** AI timeout/error + fallback fails → No question

---

## 🔧 Optimization Recommendations

### **1. Objectify Parameter Detection**

**Current Problem:** Generic AI prompt doesn't use objective criteria

**Solution:** Use `getObjectiveDetectionCriteria()` for parameter-specific detection

```javascript
// BEFORE (generic):
const detectionPrompt = `Analyze this ${language} code...`;

// AFTER (objective):
const criteria = this.getObjectiveDetectionCriteria(parameter);
const detectionPrompt = this.buildObjectiveDetectionPrompt(code, parameter, criteria);
```

**Benefits:**
- More consistent detection
- Faster (pattern matching before AI)
- Lower AI costs

---

### **2. Parallel Parameter Detection**

**Current Problem:** Sequential detection stops after first match

**Solution:** Detect all applicable parameters simultaneously

```javascript
// BEFORE:
for (let i = 0; i < parameters.length; i++) {
  const detected = await this.fastParameterDetection(...);
  if (detected) break; // Stops after first
}

// AFTER:
const detections = await Promise.all(
  parameters.map(p => this.fastParameterDetection(code, p, language))
);
// Process all detected parameters
```

**Benefits:**
- Multi-parameter code detected correctly
- Faster overall (parallel AI calls)
- Better question coverage

---

### **3. Two-Stage Question Generation**

**Current Problem:** Single slow AI call for question generation

**Solution:** Quick template + AI enhancement

```javascript
// Stage 1: Generate template (fast, <1s)
const template = this.getDepthQuestionTemplate(parameter, currentDepth);

// Stage 2: Enhance with AI (async, non-blocking)
const enhanced = await this.enhanceQuestionWithAI(template, code, context);
```

**Benefits:**
- Immediate question delivery
- Better UX (no waiting)
- Fallback always available

---

### **4. Configurable Quality Thresholds**

**Current Problem:** Fixed thresholds for all code types

**Solution:** Parameter-specific thresholds

```javascript
const thresholds = {
  'AWS Services': { minChars: 200, minLines: 8 },
  'Approach Analysis': { minChars: 150, minLines: 5 },
  'System Integration': { minChars: 180, minLines: 6 }
};
```

**Benefits:**
- Better detection for different code types
- Fewer false negatives
- More appropriate questions

---

### **5. Question Quality Scoring**

**Current Problem:** No validation of generated questions

**Solution:** Score and regenerate if low quality

```javascript
const question = await this.generateAIDepthQuestion(...);
const qualityScore = this.scoreQuestionQuality(question, code, parameter);

if (qualityScore < 0.7) {
  // Regenerate with more context
  question = await this.regenerateQuestion(question, qualityScore);
}
```

**Benefits:**
- Higher quality questions
- Better candidate experience
- More accurate assessment

---

## 📈 Performance Metrics to Track

1. **Detection Rate:** % of code submissions that detect parameters
2. **Question Generation Time:** Time from code submission to question display
3. **AI Call Success Rate:** % of successful AI calls vs timeouts/errors
4. **Question Quality Score:** Average quality of generated questions
5. **False Negative Rate:** % of meaningful code that doesn't detect parameters

---

## 🐛 Current Issues Identified

### **Issue 1: Stack Implementation Not Detected**
**Root Cause:** Generic parameter detection doesn't recognize data structure implementations as "Approach Analysis"

**Fix:** Add objective criteria for data structure patterns:
```javascript
'Approach Analysis': {
  indicators: [
    'Data structure implementation (Stack, Queue, Tree, etc.)',
    'Algorithm implementation with clear logic',
    'Error handling patterns',
    'Class/method design patterns'
  ]
}
```

### **Issue 2: Sequential Parameter Detection**
**Root Cause:** Only first parameter detected, others ignored

**Fix:** Parallel detection + multi-parameter support

### **Issue 3: No Question Caching**
**Root Cause:** Same code patterns generate questions repeatedly

**Fix:** Cache questions by code hash + parameter + depth

---

## 🎯 Action Items for Optimization

1. ✅ **Implement objective parameter detection criteria**
2. ✅ **Add parallel parameter detection**
3. ✅ **Create two-stage question generation**
4. ✅ **Add configurable quality thresholds**
5. ✅ **Implement question quality scoring**
6. ✅ **Add question caching mechanism**
7. ✅ **Improve fallback question templates**

---

## 📝 Summary

The depth question generation pipeline has **5 critical decision points** where code can be rejected:

1. **Code too short** (< 150 chars)
2. **Code fails quality filters** (boilerplate, no implementation)
3. **Parameter not detected** (AI confidence < 70%) ← **MAIN ISSUE**
4. **Already asked 3 questions**
5. **AI generation fails** (timeout/error)

**For the Stack implementation:**
- ✅ Passes length check (626 chars)
- ✅ Passes quality filters (has implementation)
- ❌ **FAILS parameter detection** (not recognized as "Approach Analysis")
- Result: No depth question generated

**Solution:** Add objective detection criteria for data structure implementations to the "Approach Analysis" parameter.


