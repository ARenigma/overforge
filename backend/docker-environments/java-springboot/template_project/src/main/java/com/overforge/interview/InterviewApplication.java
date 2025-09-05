package com.overforge.interview;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class InterviewApplication {

    public static void main(String[] args) {
        // This will be a non-web application for execution, 
        // but SpringApplication helps manage context.
        System.out.println("Starting execution...");
        // USER_CODE_REPLACEMENT_POINT
        System.out.println("Execution finished.");
    }

    // A dummy endpoint to keep the application alive if needed,
    // though we will run it as a command-line task.
    @GetMapping("/")
    public String hello() {
        return "This is the execution environment for Spring Boot.";
    }
} 