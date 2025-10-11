const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

console.log('\n🔍 DETAILED FLOW CASE STUDY');
console.log('=' .repeat(80));
console.log('📋 Scenario: Java Spring Boot REST Controller');
console.log('🎯 Objective: Map complete Q1 generation flow with precise timing');
console.log('=' .repeat(80));

const flowMap = {
    startTime: Date.now(),
    events: []
};

function logEvent(type, description, data = null) {
    const now = Date.now();
    const relativeTime = now - flowMap.startTime;
    const event = {
        timestamp: now,
        relativeTime,
        type,
        description,
        data
    };
    flowMap.events.push(event);
    console.log(`[${(relativeTime/1000).toFixed(1)}s] ${type}: ${description}`);
    return event;
}

async function runCaseStudy() {
    try {
        // Step 1: Create Session
        logEvent('SESSION_CREATE', 'Creating parameter session for Java Spring Boot');
        
        const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
            language: 'java',
            experienceLevel: 'senior',
            userId: 'case-study-user'
        });

        const sessionId = sessionResponse.data.sessionId;
        logEvent('SESSION_CREATED', `Session ID: ${sessionId}`, { sessionId });

        // Step 2: Connect WebSocket
        logEvent('WEBSOCKET_CONNECT', 'Establishing Socket.IO connection');
        
        const socket = io(SOCKET_URL);
        
        socket.on('connect', () => {
            logEvent('WEBSOCKET_CONNECTED', 'Socket.IO connection established');
            
            // Join room sequence
            logEvent('JOIN_ROOM', 'Emitting joinRoom event');
            socket.emit('joinRoom', {
                roomName: sessionId,
                userId: 'case-study-user',
                username: 'Case Study User',
                language: 'java',
                experienceLevel: 'senior'
            });

            logEvent('JOIN_ASSESSMENT_ROOM', 'Emitting joinAssessmentRoom event');
            socket.emit('joinAssessmentRoom', {
                sessionId: sessionId,
                candidateId: 'case-study-user',
                role: 'candidate'
            });
        });

        socket.on('assessmentRoomJoined', (data) => {
            logEvent('ASSESSMENT_ROOM_JOINED', 'Assessment room joined successfully', data);
            
            // Start code submission after 1 second
            setTimeout(() => {
                submitCodePhase1(socket, sessionId);
            }, 1000);
        });

        socket.on('newMessage', (data) => {
            if (data.sender && data.sender.name === 'LHIS') {
                logEvent('QUESTION_RECEIVED', `Question received: "${data.message.substring(0, 80)}..."`, {
                    questionId: data.id,
                    fullMessage: data.message,
                    sender: data.sender
                });
                
                // Submit answer after 5 seconds
                setTimeout(() => {
                    const answer = "I implemented a RESTful controller following Spring Boot conventions with proper dependency injection and HTTP status codes. The service layer separation provides clean architecture.";
                    
                    logEvent('ANSWER_SUBMIT', `Submitting answer: "${answer.substring(0, 60)}..."`);
                    
                    socket.emit('submitParameterAnswer', {
                        sessionId: sessionId,
                        parameterId: 0,
                        answer: answer
                    });
                    
                    logEvent('ANSWER_SUBMITTED', 'Answer submitted successfully');
                }, 5000);
            }
        });

        socket.on('chatMessage', (data) => {
            if (data.message && data.message.includes('✅')) {
                logEvent('FEEDBACK_RECEIVED', `Feedback: "${data.message}"`, data);
            }
        });

        // End case study after 60 seconds
        setTimeout(() => {
            generateReport();
            socket.disconnect();
            process.exit(0);
        }, 60000);
        
    } catch (error) {
        logEvent('ERROR', `Error occurred: ${error.message}`);
        console.error('Full error:', error);
        process.exit(1);
    }
}

function submitCodePhase1(socket, sessionId) {
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

    logEvent('CODE_PHASE_1_START', 'Starting code submission phase 1');
    logEvent('CODE_PHASE_1_CONTENT', `Submitting ${code.length} characters of Spring Boot controller`, {
        codeLength: code.length,
        codePreview: code.substring(0, 100) + '...',
        description: 'Spring Boot controller class with @RestController annotation and autowired service'
    });
    
    socket.emit('assessmentCodeChange', {
        sessionId: sessionId,
        code: code,
        language: 'java'
    });

    logEvent('CODE_PHASE_1_SUBMITTED', 'Phase 1 code submitted to AI for analysis');

    // Submit phase 2 after 8 seconds
    setTimeout(() => {
        submitCodePhase2(socket, sessionId, code);
    }, 8000);
}

function submitCodePhase2(socket, sessionId, previousCode) {
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

    const fullCode = previousCode + additionalCode;

    logEvent('CODE_PHASE_2_START', 'Starting code submission phase 2');
    logEvent('CODE_PHASE_2_CONTENT', `Submitting ${fullCode.length} characters with GET endpoints`, {
        codeLength: fullCode.length,
        description: 'Added GET endpoints with proper HTTP status codes and error handling'
    });
    
    socket.emit('assessmentCodeChange', {
        sessionId: sessionId,
        code: fullCode,
        language: 'java'
    });

    logEvent('CODE_PHASE_2_SUBMITTED', 'Phase 2 code submitted - RESTful GET operations complete');
}

function generateReport() {
    console.log('\n' + '='.repeat(100));
    console.log('🔍 DETAILED FLOW CASE STUDY REPORT');
    console.log('='.repeat(100));

    const totalDuration = (Date.now() - flowMap.startTime) / 1000;
    console.log(`\n📋 SESSION OVERVIEW:`);
    console.log(`   Total Duration: ${totalDuration.toFixed(1)}s`);
    console.log(`   Total Events Logged: ${flowMap.events.length}`);

    console.log(`\n⏱️ COMPLETE EVENT TIMELINE:`);
    flowMap.events.forEach((event, i) => {
        const timeStr = `${(event.relativeTime/1000).toFixed(1)}s`.padStart(6);
        console.log(`   ${timeStr} | ${event.type.padEnd(20)} | ${event.description}`);
        
        if (event.data && event.type === 'CODE_PHASE_1_CONTENT') {
            console.log(`          | ${''.padEnd(20)} | Code: ${event.data.codeLength} chars - ${event.data.description}`);
        }
        if (event.data && event.type === 'QUESTION_RECEIVED') {
            console.log(`          | ${''.padEnd(20)} | Full Question: "${event.data.fullMessage}"`);
        }
    });

    // Analyze question timing
    const questionEvents = flowMap.events.filter(e => e.type === 'QUESTION_RECEIVED');
    const codeEvents = flowMap.events.filter(e => e.type.includes('CODE_PHASE') && e.type.includes('SUBMITTED'));
    
    if (questionEvents.length > 0 && codeEvents.length > 0) {
        console.log(`\n🎯 QUESTION GENERATION ANALYSIS:`);
        const firstQuestion = questionEvents[0];
        const triggeringCode = codeEvents.find(code => code.relativeTime < firstQuestion.relativeTime);
        
        if (triggeringCode) {
            const aiProcessingTime = firstQuestion.relativeTime - triggeringCode.relativeTime;
            console.log(`   Question Generated At: ${(firstQuestion.relativeTime/1000).toFixed(1)}s`);
            console.log(`   Triggered By: ${triggeringCode.type} at ${(triggeringCode.relativeTime/1000).toFixed(1)}s`);
            console.log(`   AI Processing Time: ${(aiProcessingTime/1000).toFixed(1)}s`);
            console.log(`   Question Content: "${firstQuestion.data.fullMessage}"`);
        }
    }

    console.log('\n' + '='.repeat(100));
    console.log('🎯 CASE STUDY COMPLETE');
    console.log('='.repeat(100));
}

// Run the case study
runCaseStudy();

