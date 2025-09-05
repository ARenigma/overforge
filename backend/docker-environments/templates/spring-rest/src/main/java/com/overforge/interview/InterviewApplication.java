package com.overforge.interview;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class InterviewApplication {

    public static void main(String[] args) {
        System.out.println("🚀 Starting Spring Boot Interview Application...");
        SpringApplication.run(InterviewApplication.class, args);
        System.out.println("✅ Application started successfully!");
    }

    @GetMapping("/health")
    public String health() {
        return "Spring Boot Application is running!";
    }
}
