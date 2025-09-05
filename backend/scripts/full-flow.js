/*
 Full backend flow harness (no frontend):
 - Health check
 - Socket joinRoom and executeCode for core JS/Java/Python
 - Create production container session and call /api/execute
 - Drive LHIS module end-to-end for three depths with comparative fallback
*/

const axios = require('axios');
const io = require('socket.io-client');
const LivingAIInterviewer = require('../src/services/living-ai-interviewer');
const ProductionContainerService = require('../src/services/productionContainerService');

const BASE = process.env.BACKEND_URL || 'http://localhost:5001';

async function healthCheck() {
  const res = await axios.get(`${BASE}/health`, { timeout: 8000 });
  console.log('[health]', res.status, res.data?.services?.docker, res.data?.services?.containers?.length);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function socketExecOnce({ framework, language, code }) {
  return new Promise((resolve, reject) => {
    const roomName = `sess-${framework}-${Date.now()}`;
    const s = io(BASE, { transports: ['websocket'], timeout: 6000 });
    let done = false;
    const finish = (result) => { if (!done) { done = true; try { s.disconnect(); } catch {} resolve(result); } };
    const fail = (err) => { if (!done) { done = true; try { s.disconnect(); } catch {} reject(err); } };
    s.on('connect', async () => {
      s.emit('joinRoom', { roomName, userId: 'u1', username: 'User1', language, experienceLevel: 'mid' });
      setTimeout(() => {
        s.emit('executeCode', { roomName, code, language, framework, userId: 'u1' });
      }, 500);
    });
    s.on('executionResult', (r) => {
      finish({ output: r.output || '', error: r.error || null, webUrl: r.webUrl || null });
    });
    s.on('connect_error', (e) => fail(new Error('socket connect_error: ' + e.message)));
    setTimeout(() => fail(new Error('socket timeout')), 12000);
  });
}

async function apiExecuteViaPC({ framework, language, code }) {
  // Create a production container session first (shared container model)
  const sessionId = `pc-${framework}-${Date.now()}`;
  await ProductionContainerService.createSession({ sessionId, type: 'algorithm', language, framework, sourceCode: code, config: {} });
  const res = await axios.post(`${BASE}/api/execute`, { sessionId, code, language, framework, questionId: 'main' }, { timeout: 15000 });
  return res.data;
}

async function driveLHIS(language, code) {
  const sessionId = `lhis-${language}-${Date.now()}`;
  const jobProfile = {
    title: 'Core Engineer',
    parameters: [ { id: 0, name: `${language.toUpperCase()} Core`, description: `${language} implementation and design` } ],
    assessment_criteria: {}
  };
  const paramProgress = LivingAIInterviewer.initializeParameterProgress(jobProfile.parameters);
  LivingAIInterviewer.activeSessions.set(sessionId, {
    sessionId,
    language,
    jobProfile,
    parameterProgress: paramProgress,
    currentCode: { main: '' },
    currentProblemId: null,
    awaitingAnswer: null,
    conversationThreads: new Map(),
    conversationHistory: [],
    conversationContext: {},
    conversationNarrative: [],
    recentMentions: new Map(),
    candidatePersonality: { communicationStyle: 'concise', technicalDepth: 'surface' }
  });

  const detected = await LivingAIInterviewer.analyzeCodeProgress(sessionId, 'main', code, language);
  const q1 = await LivingAIInterviewer.triggerParameterAssessment(sessionId, 0);
  const a1 = await LivingAIInterviewer.processAnswer(sessionId, 'Because of trade-offs, optimization, and implementation details.');
  const q2 = await LivingAIInterviewer.triggerParameterAssessment(sessionId, 0);
  const a2 = await LivingAIInterviewer.processAnswer(sessionId, 'We implement layered architecture, design patterns, and clear error handling.');
  const q3 = await LivingAIInterviewer.triggerParameterAssessment(sessionId, 0);
  const a3 = await LivingAIInterviewer.processAnswer(sessionId, 'Optimizations: performance, memory, security, and maintainability.');
  return { detected, q1: !!q1, q2: !!q2, q3: !!q3, a1: a1?.action, a2: a2?.action, a3: a3?.action };
}

async function main() {
  await healthCheck();

  // Socket execution on core containers
  const jsOut = await socketExecOnce({ framework: 'javascript-core', language: 'javascript', code: 'console.log("Hello Core JS");' });
  console.log('[socket js-core]', jsOut);
  const pyOut = await socketExecOnce({ framework: 'python-core', language: 'python', code: 'print("Hello Core PY")' });
  console.log('[socket py-core]', pyOut);
  const javaOut = await socketExecOnce({ framework: 'java-core', language: 'java', code: 'public class Main{public static void main(String[]a){System.out.println("Hi");}}' });
  console.log('[socket java-core]', javaOut);

  // API execute via production container session
  const apiExecRes = await apiExecuteViaPC({ framework: 'javascript-core', language: 'javascript', code: 'console.log("API Execute")' });
  console.log('[api /execute js-core]', { success: apiExecRes.success, output: apiExecRes.output?.slice?.(0,120) || apiExecRes.error });

  // LHIS comparative questioning (module-driven, backend-only)
  const longJS = 'function solve(arr){ let i=0,j=arr.length-1; while(i<j){ i++; j--; } return arr; } '.repeat(8);
  const lhisJS = await driveLHIS('javascript', longJS);
  console.log('[lhis js]', lhisJS);
  const longPY = 'def solve(a):\n i,j=0,len(a)-1\n while i<j:\n  i+=1\n  j-=1\n return a\n' + 'x=1\n'*100;
  const lhisPY = await driveLHIS('python', longPY);
  console.log('[lhis py]', lhisPY);
  const longJAVA = 'public class Main{ public static void main(String[]a){ for(int i=0;i<100;i++){ System.out.println(i); } } }';
  const lhisJAVA = await driveLHIS('java', longJAVA);
  console.log('[lhis java]', lhisJAVA);
}

main().then(()=>process.exit(0)).catch(e=>{console.error('[full-flow] error', e.message); process.exit(1);});


