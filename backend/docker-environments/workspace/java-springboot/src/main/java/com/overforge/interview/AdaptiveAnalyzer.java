package com.overforge.interview;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Adaptive Spring Boot Code Analyzer
 * Automatically detects and adapts to any user Spring Boot implementation
 */
@Component
public class AdaptiveAnalyzer {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AnalysisResult {
        public String framework = "Spring Boot";
        public List<ModelInfo> models = new ArrayList<>();
        public List<ControllerInfo> controllers = new ArrayList<>();
        public List<ServiceInfo> services = new ArrayList<>();
        public List<RepositoryInfo> repositories = new ArrayList<>();
        public CodeStructure structure = new CodeStructure();
        public List<Adaptation> adaptations = new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ModelInfo {
        public String name;
        public String type;
        public List<FieldInfo> fields = new ArrayList<>();
        public List<MethodInfo> methods = new ArrayList<>();
        public String className;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class FieldInfo {
        public String name;
        public String type;
        public String category;
        public boolean hasGetters;
        public boolean hasSetters;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MethodInfo {
        public String name;
        public String type;
        public String returnType;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ControllerInfo {
        public String name;
        public String mapping;
        public List<EndpointInfo> endpoints = new ArrayList<>();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EndpointInfo {
        public String method;
        public String path;
        public String handler;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ServiceInfo {
        public String name;
        public String type;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RepositoryInfo {
        public String name;
        public String entityType;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class CodeStructure {
        public boolean hasSpringBoot = true;
        public boolean hasJPA = false;
        public boolean hasWeb = false;
        public boolean hasControllers = false;
        public boolean hasServices = false;
        public boolean hasRepositories = false;
        public String moduleType = "maven";
        public ComplexityInfo complexity = new ComplexityInfo();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ComplexityInfo {
        public int lines = 0;
        public int classes = 0;
        public int methods = 0;
        public int score = 0;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Adaptation {
        public String type;
        public String description;
        public Map<String, Object> options = new HashMap<>();
    }

    public AnalysisResult analyzeUserCode() {
        System.out.println("🔍 Analyzing user Spring Boot code...");
        
        AnalysisResult analysis = new AnalysisResult();
        
        try {
            // Find and analyze Java files
            analyzeJavaFiles(analysis);
            
            // Generate adaptations
            generateAdaptations(analysis);
            
            System.out.println("✅ Spring Boot analysis complete: " + 
                analysis.models.size() + " models, " + 
                analysis.controllers.size() + " controllers");
                
        } catch (Exception e) {
            System.err.println("❌ Error during code analysis: " + e.getMessage());
            e.printStackTrace();
        }
        
        return analysis;
    }

    private void analyzeJavaFiles(AnalysisResult analysis) throws IOException {
        Path sourceDir = Paths.get("src/main/java");
        
        if (!Files.exists(sourceDir)) {
            System.out.println("📝 No source directory found, creating default analysis");
            return;
        }

        try (Stream<Path> paths = Files.walk(sourceDir)) {
            paths.filter(Files::isRegularFile)
                 .filter(path -> path.toString().endsWith(".java"))
                 .forEach(path -> {
                     try {
                         String content = Files.readString(path);
                         analyzeJavaFile(content, path.getFileName().toString(), analysis);
                     } catch (IOException e) {
                         System.err.println("Error reading file: " + path);
                     }
                 });
        }
    }

    private void analyzeJavaFile(String content, String fileName, AnalysisResult analysis) {
        System.out.println("📁 Analyzing file: " + fileName);

        // Detect file type and analyze accordingly
        if (isModel(content)) {
            ModelInfo model = extractModel(content, fileName);
            if (model != null) {
                analysis.models.add(model);
            }
        }

        if (isController(content)) {
            ControllerInfo controller = extractController(content, fileName);
            if (controller != null) {
                analysis.controllers.add(controller);
                analysis.structure.hasControllers = true;
                analysis.structure.hasWeb = true;
            }
        }

        if (isService(content)) {
            ServiceInfo service = extractService(content, fileName);
            if (service != null) {
                analysis.services.add(service);
                analysis.structure.hasServices = true;
            }
        }

        if (isRepository(content)) {
            RepositoryInfo repository = extractRepository(content, fileName);
            if (repository != null) {
                analysis.repositories.add(repository);
                analysis.structure.hasRepositories = true;
                analysis.structure.hasJPA = true;
            }
        }

        // Update complexity metrics
        updateComplexity(content, analysis.structure.complexity);
    }

    private boolean isModel(String content) {
        return content.contains("@Entity") || 
               content.contains("@Table") ||
               (content.contains("class") && 
                (content.contains("private") || content.contains("public")) &&
                (content.contains("get") || content.contains("set")));
    }

    private boolean isController(String content) {
        return content.contains("@Controller") || 
               content.contains("@RestController") ||
               content.contains("@RequestMapping");
    }

    private boolean isService(String content) {
        return content.contains("@Service") || 
               content.contains("@Component") ||
               (content.contains("class") && fileName.contains("Service"));
    }

    private boolean isRepository(String content) {
        return content.contains("@Repository") || 
               content.contains("extends JpaRepository") ||
               content.contains("extends CrudRepository");
    }

    private ModelInfo extractModel(String content, String fileName) {
        ModelInfo model = new ModelInfo();
        
        // Extract class name
        Pattern classPattern = Pattern.compile("class\\s+(\\w+)");
        Matcher classMatcher = classPattern.matcher(content);
        if (classMatcher.find()) {
            model.name = classMatcher.group(1);
            model.className = model.name;
        } else {
            model.name = fileName.replace(".java", "");
            model.className = model.name;
        }

        // Determine model type
        if (content.contains("@Entity")) {
            model.type = "entity";
        } else if (content.contains("class")) {
            model.type = "class";
        } else {
            model.type = "unknown";
        }

        // Extract fields
        extractFields(content, model);
        
        // Extract methods
        extractMethods(content, model);

        return model;
    }

    private void extractFields(String content, ModelInfo model) {
        // Pattern to match field declarations
        Pattern fieldPattern = Pattern.compile("private\\s+(\\w+(?:<[^>]+>)?)\\s+(\\w+)");
        Matcher fieldMatcher = fieldPattern.matcher(content);

        while (fieldMatcher.find()) {
            FieldInfo field = new FieldInfo();
            field.type = fieldMatcher.group(1);
            field.name = fieldMatcher.group(2);
            field.category = categorizeField(field.name);
            
            // Check for getters and setters
            field.hasGetters = content.contains("get" + capitalize(field.name));
            field.hasSetters = content.contains("set" + capitalize(field.name));
            
            model.fields.add(field);
        }
    }

    private void extractMethods(String content, ModelInfo model) {
        // Pattern to match method declarations
        Pattern methodPattern = Pattern.compile("public\\s+(\\w+(?:<[^>]+>)?)\\s+(\\w+)\\s*\\(");
        Matcher methodMatcher = methodPattern.matcher(content);

        while (methodMatcher.find()) {
            MethodInfo method = new MethodInfo();
            method.returnType = methodMatcher.group(1);
            method.name = methodMatcher.group(2);
            method.type = categorizeMethod(method.name);
            
            model.methods.add(method);
        }
    }

    private ControllerInfo extractController(String content, String fileName) {
        ControllerInfo controller = new ControllerInfo();
        
        // Extract class name
        Pattern classPattern = Pattern.compile("class\\s+(\\w+)");
        Matcher classMatcher = classPattern.matcher(content);
        if (classMatcher.find()) {
            controller.name = classMatcher.group(1);
        } else {
            controller.name = fileName.replace(".java", "");
        }

        // Extract request mapping
        Pattern mappingPattern = Pattern.compile("@RequestMapping\\([\"'](.*?)[\"']\\)");
        Matcher mappingMatcher = mappingPattern.matcher(content);
        if (mappingMatcher.find()) {
            controller.mapping = mappingMatcher.group(1);
        }

        // Extract endpoints
        extractEndpoints(content, controller);

        return controller;
    }

    private void extractEndpoints(String content, ControllerInfo controller) {
        String[] httpMethods = {"GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "RequestMapping"};
        
        for (String httpMethod : httpMethods) {
            Pattern endpointPattern = Pattern.compile("@" + httpMethod + "\\([\"'](.*?)[\"']\\)\\s*public\\s+\\w+\\s+(\\w+)");
            Matcher endpointMatcher = endpointPattern.matcher(content);
            
            while (endpointMatcher.find()) {
                EndpointInfo endpoint = new EndpointInfo();
                endpoint.method = httpMethod.replace("Mapping", "").toUpperCase();
                endpoint.path = endpointMatcher.group(1);
                endpoint.handler = endpointMatcher.group(2);
                
                controller.endpoints.add(endpoint);
            }
        }
    }

    private ServiceInfo extractService(String content, String fileName) {
        ServiceInfo service = new ServiceInfo();
        
        Pattern classPattern = Pattern.compile("class\\s+(\\w+)");
        Matcher classMatcher = classPattern.matcher(content);
        if (classMatcher.find()) {
            service.name = classMatcher.group(1);
        } else {
            service.name = fileName.replace(".java", "");
        }

        if (content.contains("@Service")) {
            service.type = "service";
        } else if (content.contains("@Component")) {
            service.type = "component";
        } else {
            service.type = "class";
        }

        return service;
    }

    private RepositoryInfo extractRepository(String content, String fileName) {
        RepositoryInfo repository = new RepositoryInfo();
        
        Pattern classPattern = Pattern.compile("class\\s+(\\w+)");
        Matcher classMatcher = classPattern.matcher(content);
        if (classMatcher.find()) {
            repository.name = classMatcher.group(1);
        } else {
            repository.name = fileName.replace(".java", "");
        }

        // Extract entity type from generic
        Pattern entityPattern = Pattern.compile("extends\\s+\\w+Repository<(\\w+),");
        Matcher entityMatcher = entityPattern.matcher(content);
        if (entityMatcher.find()) {
            repository.entityType = entityMatcher.group(1);
        }

        return repository;
    }

    private String categorizeField(String fieldName) {
        String fieldLower = fieldName.toLowerCase();
        
        if (fieldLower.equals("id") || fieldLower.contains("id")) return "identifier";
        if (fieldLower.contains("name") || fieldLower.contains("title") || fieldLower.contains("subject")) return "display";
        if (fieldLower.contains("content") || fieldLower.contains("body") || fieldLower.contains("description")) return "content";
        if (fieldLower.contains("author") || fieldLower.contains("user") || fieldLower.contains("creator")) return "author";
        if (fieldLower.contains("created") || fieldLower.contains("updated") || fieldLower.contains("date") || fieldLower.contains("time")) return "timestamp";
        if (fieldLower.contains("email") || fieldLower.contains("phone") || fieldLower.contains("address")) return "contact";
        if (fieldLower.contains("price") || fieldLower.contains("cost") || fieldLower.contains("amount") || fieldLower.contains("value")) return "numeric";
        
        return "general";
    }

    private String categorizeMethod(String methodName) {
        String methodLower = methodName.toLowerCase();
        
        if (methodLower.startsWith("get") || methodLower.contains("find") || methodLower.contains("search")) return "read";
        if (methodLower.startsWith("set") || methodLower.contains("create") || methodLower.contains("add") || methodLower.contains("insert")) return "create";
        if (methodLower.contains("update") || methodLower.contains("edit") || methodLower.contains("modify")) return "update";
        if (methodLower.contains("delete") || methodLower.contains("remove") || methodLower.contains("destroy")) return "delete";
        
        return "utility";
    }

    private void updateComplexity(String content, ComplexityInfo complexity) {
        complexity.lines += content.split("\n").length;
        complexity.classes += countOccurrences(content, "class\\s+\\w+");
        complexity.methods += countOccurrences(content, "public\\s+\\w+\\s+\\w+\\s*\\(");
        complexity.score = Math.min(10, (complexity.lines + complexity.classes * 5 + complexity.methods * 2) / 20);
    }

    private int countOccurrences(String content, String regex) {
        Pattern pattern = Pattern.compile(regex);
        Matcher matcher = pattern.matcher(content);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }

    private void generateAdaptations(AnalysisResult analysis) {
        // Add missing web layer if models exist but no controllers
        if (!analysis.models.isEmpty() && analysis.controllers.isEmpty()) {
            Adaptation webLayer = new Adaptation();
            webLayer.type = "generate_web_layer";
            webLayer.description = "Generate REST controllers for detected models";
            webLayer.options.put("models", analysis.models.stream().map(m -> m.name).toArray());
            analysis.adaptations.add(webLayer);
        }

        // Add health check endpoint
        Adaptation healthCheck = new Adaptation();
        healthCheck.type = "add_health_check";
        healthCheck.description = "Add health check endpoint";
        healthCheck.options.put("path", "/health");
        analysis.adaptations.add(healthCheck);

        // Add API documentation if controllers exist
        if (!analysis.controllers.isEmpty()) {
            Adaptation apiDocs = new Adaptation();
            apiDocs.type = "add_api_docs";
            apiDocs.description = "Add API documentation endpoint";
            apiDocs.options.put("path", "/api/docs");
            analysis.adaptations.add(apiDocs);
        }

        // Add repository layer if models exist but no repositories
        if (!analysis.models.isEmpty() && analysis.repositories.isEmpty()) {
            Adaptation repoLayer = new Adaptation();
            repoLayer.type = "generate_repository_layer";
            repoLayer.description = "Generate JPA repositories for detected models";
            analysis.adaptations.add(repoLayer);
        }
    }

    private String capitalize(String str) {
        if (str == null || str.isEmpty()) return str;
        return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
} 