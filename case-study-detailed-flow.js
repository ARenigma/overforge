const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

class DetailedFlowCaseStudy {
    constructor() {
        this.socket = null;
        this.flowMap = {
            sessionId: null,
            startTime: null,
            events: [],
            codeSubmissions: [],
            questions: [],
            answers: [],
            feedback: [],
            aiAnalysis: []
        };
    }

    logEvent(type, data, timing = null) {
        const timestamp = Date.now();
        const relativeTime = this.flowMap.startTime ? timestamp - this.flowMap.startTime : 0;
        
        const event = {
            timestamp,
            relativeTime,
            type,
            data,
            timing
        };
        
        this.flowMap.events.push(event);
        console.log(`[${relativeTime}ms] ${type}:`, data);
        
        return event;
    }

    async runCaseStudy() {
        console.log('\n🔍 DETAILED FLOW CASE STUDY');
        console.log('=' .repeat(80));
        console.log('📋 Scenario: Java Spring Boot REST Controller');
        console.log('🎯 Objective: Map complete Q1 generation flow with precise timing');
        console.log('=' .repeat(80));

        this.flowMap.startTime = Date.now();
        
        try {
            // Step 1: Create Session
            this.logEvent('SESSION_CREATE_START', 'Creating parameter session...');
            
            const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
                language: 'java',
                experienceLevel: 'senior',
                userId: 'case-study-user'
            });

            this.flowMap.sessionId = sessionResponse.data.sessionId;
            this.logEvent('SESSION_CREATED', {
                sessionId: this.flowMap.sessionId,
                status: sessionResponse.status
            });

            // Step 2: Connect WebSocket
            this.logEvent('WEBSOCKET_CONNECT_START', 'Connecting to WebSocket...');
            
            this.socket = io(SOCKET_URL);
            
            this.setupSocketListeners();
            
            // Step 3: Wait for complete flow
            return new Promise((resolve) => {
                // Set timeout for complete flow
                setTimeout(() => {
                    this.generateDetailedReport();
                    resolve();
                }, 90000); // 90 seconds max
            });
            
        } catch (error) {
            this.logEvent('ERROR', error.message);
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.logEvent('WEBSOCKET_CONNECTED', 'Socket.IO connection established');
            
            // Join room sequence
            this.logEvent('JOIN_ROOM_START', 'Joining main room...');
            this.socket.emit('joinRoom', {
                roomName: this.flowMap.sessionId,
                userId: 'case-study-user',
                username: 'Case Study User',
                language: 'java',
                experienceLevel: 'senior'
            });

            this.logEvent('JOIN_ASSESSMENT_ROOM_START', 'Joining assessment room...');
            this.socket.emit('joinAssessmentRoom', {
                sessionId: this.flowMap.sessionId,
                candidateId: 'case-study-user',
                role: 'candidate'
            });
        });

        this.socket.on('assessmentRoomJoined', (data) => {
            this.logEvent('ASSESSMENT_ROOM_JOINED', data);
            
            // Start code submission sequence
            setTimeout(() => this.submitCodePhase1(), 1000);
        });

        this.socket.on('newMessage', (data) => {
            if (data.sender && data.sender.name === 'LHIS') {
                this.logEvent('QUESTION_RECEIVED', {
                    questionId: data.id,
                    message: data.message,
                    sender: data.sender,
                    questionNumber: this.flowMap.questions.length + 1
                });
                
                this.flowMap.questions.push({
                    id: data.id,
                    message: data.message,
                    receivedAt: Date.now(),
                    relativeTime: Date.now() - this.flowMap.startTime,
                    questionNumber: this.flowMap.questions.length + 1
                });

                // Submit answer after 5 seconds
                setTimeout(() => {
                    this.submitAnswer(this.flowMap.questions.length);
                }, 5000);
            }
        });

        this.socket.on('chatMessage', (data) => {
            if (data.message && data.message.includes('✅')) {
                this.logEvent('FEEDBACK_RECEIVED', {
                    feedbackId: data.id,
                    message: data.message,
                    feedbackNumber: this.flowMap.feedback.length + 1
                });
                
                this.flowMap.feedback.push({
                    id: data.id,
                    message: data.message,
                    receivedAt: Date.now(),
                    relativeTime: Date.now() - this.flowMap.startTime
                });
            }
        });

        // Debug listeners
        this.socket.on('debugMessage', (data) => {
            this.logEvent('DEBUG_MESSAGE', data);
        });

        this.socket.on('connect_error', (error) => {
            this.logEvent('WEBSOCKET_ERROR', error.message);
        });
    }

    submitCodePhase1() {
        const code = `package com.example.demo.controller;

import com.example.demo.model.User;
import com.example.demo.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {
    
    @Autowired
    private UserService userService;`;

        this.logEvent('CODE_PHASE_1_START', 'Submitting initial Spring Boot controller structure...');
        
        this.socket.emit('assessmentCodeChange', {
            sessionId: this.flowMap.sessionId,
            code: code,
            language: 'java'
        });

        this.flowMap.codeSubmissions.push({
            phase: 1,
            code: code,
            length: code.length,
            submittedAt: Date.now(),
            relativeTime: Date.now() - this.flowMap.startTime,
            description: 'Spring Boot controller class definition with autowired service'
        });

        this.logEvent('CODE_PHASE_1_SUBMITTED', {
            codeLength: code.length,
            description: 'Basic controller structure with annotations'
        });

        // Wait 8 seconds then submit phase 2
        setTimeout(() => this.submitCodePhase2(), 8000);
    }

    submitCodePhase2() {
        const additionalCode = `
    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        try {
            List<User> users = userService.getAllUsers();
            return new ResponseEntity<>(users, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<User> getUserById(@PathVariable Long id) {
        try {
            User user = userService.getUserById(id);
            if (user != null) {
                return new ResponseEntity<>(user, HttpStatus.OK);
            } else {
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            }
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }`;

        const fullCode = this.flowMap.codeSubmissions[0].code + additionalCode;

        this.logEvent('CODE_PHASE_2_START', 'Adding GET endpoints with error handling...');
        
        this.socket.emit('assessmentCodeChange', {
            sessionId: this.flowMap.sessionId,
            code: fullCode,
            language: 'java'
        });

        this.flowMap.codeSubmissions.push({
            phase: 2,
            code: fullCode,
            length: fullCode.length,
            submittedAt: Date.now(),
            relativeTime: Date.now() - this.flowMap.startTime,
            description: 'Added GET endpoints with proper HTTP status codes and error handling'
        });

        this.logEvent('CODE_PHASE_2_SUBMITTED', {
            codeLength: fullCode.length,
            description: 'RESTful GET endpoints with ResponseEntity pattern'
        });

        // Wait 8 seconds then submit phase 3
        setTimeout(() => this.submitCodePhase3(), 8000);
    }

    submitCodePhase3() {
        const finalCode = `    
    @PostMapping
    public ResponseEntity<User> createUser(@Valid @RequestBody User user) {
        try {
            User createdUser = userService.createUser(user);
            return new ResponseEntity<>(createdUser, HttpStatus.CREATED);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<User> updateUser(@PathVariable Long id, @Valid @RequestBody User user) {
        try {
            User updatedUser = userService.updateUser(id, user);
            if (updatedUser != null) {
                return new ResponseEntity<>(updatedUser, HttpStatus.OK);
            } else {
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            }
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<HttpStatus> deleteUser(@PathVariable Long id) {
        try {
            userService.deleteUser(id);
            return new ResponseEntity<>(HttpStatus.NO_CONTENT);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}`;

        const completeCode = this.flowMap.codeSubmissions[1].code + finalCode;

        this.logEvent('CODE_PHASE_3_START', 'Completing CRUD operations...');
        
        this.socket.emit('assessmentCodeChange', {
            sessionId: this.flowMap.sessionId,
            code: completeCode,
            language: 'java'
        });

        this.flowMap.codeSubmissions.push({
            phase: 3,
            code: completeCode,
            length: completeCode.length,
            submittedAt: Date.now(),
            relativeTime: Date.now() - this.flowMap.startTime,
            description: 'Complete CRUD operations with validation and proper HTTP methods'
        });

        this.logEvent('CODE_PHASE_3_SUBMITTED', {
            codeLength: completeCode.length,
            description: 'Full RESTful controller with POST, PUT, DELETE operations'
        });
    }

    submitAnswer(questionNumber) {
        const answers = [
            "I implemented a RESTful controller following Spring Boot conventions with proper dependency injection and HTTP status codes. The service layer separation provides clean architecture and the @Valid annotation ensures data validation.",
            "I considered using @ResponseStatus annotations vs ResponseEntity. ResponseEntity gives more control over responses but is more verbose. I chose it for explicit status code management and better error handling control.",
            "For enterprise scaling, I'd add Spring Security for authentication, implement proper exception handling with @ControllerAdvice, add API versioning, use Spring Boot Actuator for monitoring, and implement caching with Redis."
        ];

        const answer = answers[questionNumber - 1];
        
        this.logEvent('ANSWER_SUBMIT_START', {
            questionNumber,
            answerPreview: answer.substring(0, 100) + '...'
        });

        this.socket.emit('submitParameterAnswer', {
            sessionId: this.flowMap.sessionId,
            parameterId: 0,
            answer: answer
        });

        this.flowMap.answers.push({
            questionNumber,
            answer,
            submittedAt: Date.now(),
            relativeTime: Date.now() - this.flowMap.startTime
        });

        this.logEvent('ANSWER_SUBMITTED', {
            questionNumber,
            answerLength: answer.length
        });
    }

    async waitForCompleteFlow() {
        return new Promise((resolve) => {
            // Wait for 3 questions or 2 minutes max
            const checkCompletion = () => {
                if (this.flowMap.questions.length >= 3 || Date.now() - this.flowMap.startTime > 120000) {
                    this.generateDetailedReport();
                    resolve();
                } else {
                    setTimeout(checkCompletion, 1000);
                }
            };
            
            setTimeout(checkCompletion, 1000);
        });
    }

    generateDetailedReport() {
        console.log('\n' + '='.repeat(100));
        console.log('🔍 DETAILED FLOW CASE STUDY REPORT');
        console.log('='.repeat(100));

        console.log(`\n📋 SESSION OVERVIEW:`);
        console.log(`   Session ID: ${this.flowMap.sessionId}`);
        console.log(`   Total Duration: ${(Date.now() - this.flowMap.startTime)/1000}s`);
        console.log(`   Total Events: ${this.flowMap.events.length}`);
        console.log(`   Questions Generated: ${this.flowMap.questions.length}`);
        console.log(`   Answers Submitted: ${this.flowMap.answers.length}`);
        console.log(`   Feedback Received: ${this.flowMap.feedback.length}`);

        console.log(`\n🏗️ CODE SUBMISSION TIMELINE:`);
        this.flowMap.codeSubmissions.forEach((submission, i) => {
            console.log(`   Phase ${submission.phase} (${(submission.relativeTime/1000).toFixed(1)}s):`);
            console.log(`     Length: ${submission.length} characters`);
            console.log(`     Content: ${submission.description}`);
            console.log(`     Code Preview: "${submission.code.substring(0, 80)}..."`);
            console.log();
        });

        if (this.flowMap.questions.length > 0) {
            console.log(`\n❓ QUESTION 1 DETAILED ANALYSIS:`);
            const q1 = this.flowMap.questions[0];
            console.log(`   Question ID: ${q1.id}`);
            console.log(`   Generated At: ${(q1.relativeTime/1000).toFixed(1)}s`);
            console.log(`   Full Question: "${q1.message}"`);
            
            // Find what code submission triggered this question
            const triggeringSubmission = this.flowMap.codeSubmissions.find(sub => 
                sub.relativeTime < q1.relativeTime
            );
            
            if (triggeringSubmission) {
                const timeDiff = q1.relativeTime - triggeringSubmission.relativeTime;
                console.log(`\n🎯 TRIGGER ANALYSIS:`);
                console.log(`   Triggered By: Code Phase ${triggeringSubmission.phase}`);
                console.log(`   Code Length: ${triggeringSubmission.length} characters`);
                console.log(`   AI Processing Time: ${(timeDiff/1000).toFixed(1)}s`);
                console.log(`   Trigger Content: ${triggeringSubmission.description}`);
            }

            if (this.flowMap.answers.length > 0) {
                const a1 = this.flowMap.answers[0];
                console.log(`\n💬 ANSWER 1 ANALYSIS:`);
                console.log(`   Answer Length: ${a1.answer.length} characters`);
                console.log(`   Submitted At: ${(a1.relativeTime/1000).toFixed(1)}s`);
                console.log(`   Answer Preview: "${a1.answer.substring(0, 120)}..."`);
                
                if (this.flowMap.feedback.length > 0) {
                    const f1 = this.flowMap.feedback[0];
                    const processingTime = f1.relativeTime - a1.relativeTime;
                    console.log(`\n✅ FEEDBACK 1 ANALYSIS:`);
                    console.log(`   Feedback: "${f1.message}"`);
                    console.log(`   Processing Time: ${(processingTime/1000).toFixed(1)}s`);
                }
            }
        }

        console.log(`\n⏱️ COMPLETE EVENT TIMELINE:`);
        this.flowMap.events.forEach((event, i) => {
            const timeStr = `${(event.relativeTime/1000).toFixed(1)}s`.padStart(8);
            console.log(`   ${timeStr} | ${event.type}: ${typeof event.data === 'string' ? event.data : JSON.stringify(event.data).substring(0, 60)}`);
        });

        console.log('\n' + '='.repeat(100));
        
        if (this.flowMap.questions.length > 0) {
            console.log('🎯 CASE STUDY CONCLUSION: SUCCESS');
            console.log('✅ Complete Q1 generation flow mapped with precise timing');
            console.log(`✅ AI processing time: ${((this.flowMap.questions[0].relativeTime - this.flowMap.codeSubmissions[0].relativeTime)/1000).toFixed(1)}s`);
        } else {
            console.log('⚠️ CASE STUDY CONCLUSION: NO QUESTIONS GENERATED');
        }
        console.log('='.repeat(100));

        this.socket.disconnect();
        process.exit(0);
    }
}

// Run the detailed case study
const caseStudy = new DetailedFlowCaseStudy();
caseStudy.runCaseStudy().catch(console.error);
