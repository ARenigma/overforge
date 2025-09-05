package com.overforge.interview;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.http.ResponseEntity;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.*;

@Controller
public class ModelDetectionController {

    @Autowired
    private ModelAnalysisService modelAnalysisService;

    private Class<?> currentModelClass;
    private Map<String, Object> currentModelAnalysis;
    private List<Map<String, Object>> currentSampleData;

    @GetMapping("/")
    public String index(Model model) {
        detectAndAnalyzeModel();

        if (currentModelClass != null) {
            model.addAttribute("modelAnalysis", currentModelAnalysis);
            model.addAttribute("sampleData", currentSampleData);
            model.addAttribute("modelDetected", true);
        } else {
            model.addAttribute("modelDetected", false);
        }

        return "index";
    }

    @GetMapping("/api/model/analysis")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> getModelAnalysis() {
        detectAndAnalyzeModel();

        if (currentModelClass != null) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("analysis", currentModelAnalysis);
            response.put("sampleData", currentSampleData);
            return ResponseEntity.ok(response);
        } else {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "No model class detected. Please create a Java class in the controller directory.");
            return ResponseEntity.ok(response);
        }
    }

    @PostMapping("/api/model/reload")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> reloadModel() {
        System.out.println("🔄 Reloading model...");
        detectAndAnalyzeModel();

        Map<String, Object> response = new HashMap<>();
        if (currentModelClass != null) {
            response.put("success", true);
            response.put("message", "Model reloaded successfully: " + currentModelClass.getSimpleName());
            response.put("analysis", currentModelAnalysis);
        } else {
            response.put("success", false);
            response.put("message", "No model class found to reload");
        }

        return ResponseEntity.ok(response);
    }

    @GetMapping("/api/{modelName}")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> getModelData(@PathVariable String modelName) {
        if (currentModelClass != null && currentModelClass.getSimpleName().toLowerCase().equals(modelName.toLowerCase())) {
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", currentSampleData);
            response.put("total", currentSampleData.size());
            response.put("model", currentModelClass.getSimpleName());
            return ResponseEntity.ok(response);
        } else {
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "Model not found: " + modelName);
            return ResponseEntity.ok(response);
        }
    }

    private void detectAndAnalyzeModel() {
        try {
            // Look for Java class files in the controller directory
            File controllerDir = new File("src/main/java/com/overforge/interview/controller");

            if (controllerDir.exists() && controllerDir.isDirectory()) {
                File[] javaFiles = controllerDir.listFiles((dir, name) -> name.endsWith(".java"));

                if (javaFiles != null && javaFiles.length > 0) {
                    // Try to load the first Java file as a model class
                    for (File javaFile : javaFiles) {
                        try {
                            String className = javaFile.getName().replace(".java", "");
                            String fullClassName = "com.overforge.interview.controller." + className;

                            // Try to load the class
                            ClassLoader classLoader = this.getClass().getClassLoader();
                            Class<?> modelClass = classLoader.loadClass(fullClassName);

                            // Analyze the model
                            currentModelClass = modelClass;
                            currentModelAnalysis = modelAnalysisService.analyzeModel(modelClass);
                            currentSampleData = modelAnalysisService.generateSampleData(modelClass, 5);

                            System.out.println("✅ Model detected and analyzed: " + className);
                            return;
                        } catch (Exception e) {
                            System.out.println("⚠️ Could not load class from file: " + javaFile.getName() + " - " + e.getMessage());
                        }
                    }
                }
            }

            // Fallback: No model detected
            currentModelClass = null;
            currentModelAnalysis = null;
            currentSampleData = null;
            System.out.println("📝 No model class detected in controller directory");

        } catch (Exception e) {
            System.out.println("❌ Error detecting model: " + e.getMessage());
            currentModelClass = null;
            currentModelAnalysis = null;
            currentSampleData = null;
        }
    }
}
