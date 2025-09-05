package com.overforge.interview;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class InterviewApplication {
    public static void main(String[] args) {
        SpringApplication.run(InterviewApplication.class, args);
    }
    
    @GetMapping("/")
    public String home() {
        return "Spring Boot Interview Environment Ready!";
    }
    
    @GetMapping("/health")
    public String health() {
        return "OK";
    }
}
