package com.overforge.interview;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Adaptive Spring Boot Controller
 * Automatically adapts to any user Spring Boot code implementation
 */
@RestController
@CrossOrigin(origins = "*")
public class AdaptiveController {

    @Autowired
    private AdaptiveAnalyzer analyzer;

    private AdaptiveAnalyzer.AnalysisResult cachedAnalysis;

    @GetMapping("/")
    public ResponseEntity<Map<String, Object>> getApiInfo() {
        Map<String, Object> response = new HashMap<>();
        
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        response.put("framework", "Spring Boot Adaptive System");
        response.put("message", "Adaptive Spring Boot application running");
        response.put("analysis", cachedAnalysis);
        response.put("endpoints", generateEndpointList());
        response.put("documentation", "/api/docs");

        return ResponseEntity.ok(response);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "healthy");
        health.put("framework", "Spring Boot");
        health.put("timestamp", new Date().toString());
        health.put("analysis", cachedAnalysis != null ? "loaded" : "pending");
        
        return ResponseEntity.ok(health);
    }

    @GetMapping("/api/docs")
    public ResponseEntity<Map<String, Object>> getApiDocumentation() {
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        Map<String, Object> docs = new HashMap<>();
        docs.put("title", "Adaptive Spring Boot API Documentation");
        docs.put("description", "Auto-generated documentation based on code analysis");
        docs.put("analysis", cachedAnalysis);
        docs.put("endpoints", generateDetailedEndpoints());
        docs.put("models", cachedAnalysis.models);
        docs.put("adaptations", cachedAnalysis.adaptations);

        return ResponseEntity.ok(docs);
    }

    @GetMapping("/api/models")
    public ResponseEntity<Map<String, Object>> getModels() {
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        Map<String, Object> response = new HashMap<>();
        response.put("models", cachedAnalysis.models);
        response.put("count", cachedAnalysis.models.size());
        response.put("framework", "Spring Boot");

        return ResponseEntity.ok(response);
    }

    @GetMapping("/api/analysis")
    public ResponseEntity<AdaptiveAnalyzer.AnalysisResult> getAnalysis() {
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        return ResponseEntity.ok(cachedAnalysis);
    }

    @PostMapping("/api/reload")
    public ResponseEntity<Map<String, Object>> reloadCode() {
        System.out.println("🔄 Reloading user code...");
        cachedAnalysis = analyzer.analyzeUserCode();

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "User code reloaded and analyzed");
        response.put("analysis", cachedAnalysis);

        return ResponseEntity.ok(response);
    }

    // Dynamic model endpoints - generate CRUD operations for each detected model
    @GetMapping("/api/{modelName}")
    public ResponseEntity<Map<String, Object>> getModelData(@PathVariable String modelName) {
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        Optional<AdaptiveAnalyzer.ModelInfo> modelOpt = findModelByName(modelName);
        if (modelOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        AdaptiveAnalyzer.ModelInfo model = modelOpt.get();
        Map<String, Object> response = new HashMap<>();
        response.put("model", model.name);
        response.put("data", generateSampleData(model));
        response.put("fields", model.fields);
        response.put("message", "List of " + model.name + " records (sample data)");

        return ResponseEntity.ok(response);
    }

    @GetMapping("/api/{modelName}/{id}")
    public ResponseEntity<Map<String, Object>> getModelRecord(
            @PathVariable String modelName, 
            @PathVariable String id) {
        
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        Optional<AdaptiveAnalyzer.ModelInfo> modelOpt = findModelByName(modelName);
        if (modelOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        AdaptiveAnalyzer.ModelInfo model = modelOpt.get();
        Map<String, Object> response = new HashMap<>();
        response.put("model", model.name);
        response.put("id", id);
        response.put("data", generateSampleRecord(model, id));
        response.put("fields", model.fields);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/{modelName}")
    public ResponseEntity<Map<String, Object>> createModelRecord(
            @PathVariable String modelName,
            @RequestBody Map<String, Object> data) {
        
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        Optional<AdaptiveAnalyzer.ModelInfo> modelOpt = findModelByName(modelName);
        if (modelOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        AdaptiveAnalyzer.ModelInfo model = modelOpt.get();
        Map<String, Object> response = new HashMap<>();
        
        Map<String, Object> newRecord = new HashMap<>(data);
        newRecord.put("id", System.currentTimeMillis());
        
        response.put("model", model.name);
        response.put("message", model.name + " created successfully");
        response.put("data", newRecord);
        response.put("success", true);

        return ResponseEntity.ok(response);
    }

    @PutMapping("/api/{modelName}/{id}")
    public ResponseEntity<Map<String, Object>> updateModelRecord(
            @PathVariable String modelName,
            @PathVariable String id,
            @RequestBody Map<String, Object> data) {
        
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        Optional<AdaptiveAnalyzer.ModelInfo> modelOpt = findModelByName(modelName);
        if (modelOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        AdaptiveAnalyzer.ModelInfo model = modelOpt.get();
        Map<String, Object> response = new HashMap<>();
        
        Map<String, Object> updatedRecord = new HashMap<>(data);
        updatedRecord.put("id", id);
        
        response.put("model", model.name);
        response.put("id", id);
        response.put("message", model.name + " updated successfully");
        response.put("data", updatedRecord);
        response.put("success", true);

        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/api/{modelName}/{id}")
    public ResponseEntity<Map<String, Object>> deleteModelRecord(
            @PathVariable String modelName,
            @PathVariable String id) {
        
        if (cachedAnalysis == null) {
            cachedAnalysis = analyzer.analyzeUserCode();
        }

        Optional<AdaptiveAnalyzer.ModelInfo> modelOpt = findModelByName(modelName);
        if (modelOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        AdaptiveAnalyzer.ModelInfo model = modelOpt.get();
        Map<String, Object> response = new HashMap<>();
        response.put("model", model.name);
        response.put("id", id);
        response.put("message", model.name + " deleted successfully");
        response.put("success", true);

        return ResponseEntity.ok(response);
    }

    // Helper methods
    private Optional<AdaptiveAnalyzer.ModelInfo> findModelByName(String modelName) {
        if (cachedAnalysis == null || cachedAnalysis.models == null) {
            return Optional.empty();
        }

        return cachedAnalysis.models.stream()
                .filter(model -> model.name.equalsIgnoreCase(modelName) || 
                               (model.name.toLowerCase() + "s").equals(modelName.toLowerCase()))
                .findFirst();
    }

    private List<Map<String, Object>> generateSampleData(AdaptiveAnalyzer.ModelInfo model) {
        List<Map<String, Object>> sampleData = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            sampleData.add(generateSampleRecord(model, String.valueOf(i)));
        }
        return sampleData;
    }

    private Map<String, Object> generateSampleRecord(AdaptiveAnalyzer.ModelInfo model, String id) {
        Map<String, Object> record = new HashMap<>();
        record.put("id", id);

        for (AdaptiveAnalyzer.FieldInfo field : model.fields) {
            switch (field.category) {
                case "display":
                    record.put(field.name, "Sample " + field.name + " " + id);
                    break;
                case "content":
                    record.put(field.name, "This is sample " + field.name + " content for record " + id);
                    break;
                case "author":
                    record.put(field.name, "User" + id);
                    break;
                case "timestamp":
                    record.put(field.name, new Date().toString());
                    break;
                case "numeric":
                    record.put(field.name, (int)(Math.random() * 100));
                    break;
                case "contact":
                    if (field.name.toLowerCase().contains("email")) {
                        record.put(field.name, "user" + id + "@example.com");
                    } else {
                        record.put(field.name, "123-456-" + (1000 + Integer.parseInt(id)));
                    }
                    break;
                default:
                    record.put(field.name, "Sample " + field.name);
            }
        }

        return record;
    }

    private List<Map<String, Object>> generateEndpointList() {
        List<Map<String, Object>> endpoints = new ArrayList<>();
        
        // Basic endpoints
        endpoints.add(createEndpoint("GET", "/", "API information and analysis"));
        endpoints.add(createEndpoint("GET", "/health", "Health check"));
        endpoints.add(createEndpoint("GET", "/api/docs", "API documentation"));
        endpoints.add(createEndpoint("GET", "/api/models", "List detected models"));
        endpoints.add(createEndpoint("GET", "/api/analysis", "Code analysis results"));
        endpoints.add(createEndpoint("POST", "/api/reload", "Reload user code"));

        // Model-specific endpoints
        if (cachedAnalysis != null && cachedAnalysis.models != null) {
            for (AdaptiveAnalyzer.ModelInfo model : cachedAnalysis.models) {
                String modelName = model.name.toLowerCase();
                endpoints.add(createEndpoint("GET", "/api/" + modelName, "List " + model.name + " records"));
                endpoints.add(createEndpoint("POST", "/api/" + modelName, "Create " + model.name));
                endpoints.add(createEndpoint("GET", "/api/" + modelName + "/{id}", "Get " + model.name + " by ID"));
                endpoints.add(createEndpoint("PUT", "/api/" + modelName + "/{id}", "Update " + model.name));
                endpoints.add(createEndpoint("DELETE", "/api/" + modelName + "/{id}", "Delete " + model.name));
            }
        }

        return endpoints;
    }

    private Map<String, Object> generateDetailedEndpoints() {
        Map<String, Object> detailed = new HashMap<>();
        
        List<Map<String, Object>> general = new ArrayList<>();
        general.add(Map.of(
            "method", "GET",
            "path", "/",
            "description", "API information and code analysis",
            "response", "JSON with framework info and analysis"
        ));
        general.add(Map.of(
            "method", "GET",
            "path", "/health",
            "description", "Health check endpoint",
            "response", "Server health status"
        ));
        
        detailed.put("general", general);

        if (cachedAnalysis != null && cachedAnalysis.models != null) {
            List<Map<String, Object>> models = new ArrayList<>();
            for (AdaptiveAnalyzer.ModelInfo model : cachedAnalysis.models) {
                Map<String, Object> modelEndpoints = new HashMap<>();
                modelEndpoints.put("model", model.name);
                
                List<Map<String, Object>> endpoints = new ArrayList<>();
                String modelName = model.name.toLowerCase();
                endpoints.add(Map.of("method", "GET", "path", "/api/" + modelName, "description", "List all records"));
                endpoints.add(Map.of("method", "POST", "path", "/api/" + modelName, "description", "Create new record"));
                endpoints.add(Map.of("method", "GET", "path", "/api/" + modelName + "/{id}", "description", "Get record by ID"));
                endpoints.add(Map.of("method", "PUT", "path", "/api/" + modelName + "/{id}", "description", "Update record"));
                endpoints.add(Map.of("method", "DELETE", "path", "/api/" + modelName + "/{id}", "description", "Delete record"));
                
                modelEndpoints.put("endpoints", endpoints);
                modelEndpoints.put("fields", model.fields);
                models.add(modelEndpoints);
            }
            detailed.put("models", models);
        }

        return detailed;
    }

    private Map<String, Object> createEndpoint(String method, String path, String description) {
        Map<String, Object> endpoint = new HashMap<>();
        endpoint.put("method", method);
        endpoint.put("path", path);
        endpoint.put("description", description);
        return endpoint;
    }
} 