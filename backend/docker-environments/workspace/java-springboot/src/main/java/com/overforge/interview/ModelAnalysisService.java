package com.overforge.interview;

import org.springframework.stereotype.Service;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ModelAnalysisService {

    public Map<String, Object> analyzeModel(Class<?> modelClass) {
        Map<String, Object> analysis = new HashMap<>();

        // Basic model info
        analysis.put("modelName", modelClass.getSimpleName());
        analysis.put("fullClassName", modelClass.getName());
        analysis.put("packageName", modelClass.getPackage().getName());

        // Analyze fields
        Field[] fields = modelClass.getDeclaredFields();
        List<Map<String, Object>> fieldAnalysis = new ArrayList<>();

        for (Field field : fields) {
            Map<String, Object> fieldInfo = new HashMap<>();
            fieldInfo.put("name", field.getName());
            fieldInfo.put("type", field.getType().getSimpleName());
            fieldInfo.put("fullType", field.getType().getName());
            fieldAnalysis.add(fieldInfo);
        }

        analysis.put("fields", fieldAnalysis);
        analysis.put("fieldCount", fields.length);

        // Analyze methods
        Method[] methods = modelClass.getDeclaredMethods();
        List<Map<String, Object>> methodAnalysis = Arrays.stream(methods)
            .filter(method -> !method.getName().startsWith("get") &&
                             !method.getName().startsWith("set") &&
                             !method.getName().equals("toString") &&
                             !method.getName().equals("hashCode") &&
                             !method.getName().equals("equals"))
            .map(method -> {
                Map<String, Object> methodInfo = new HashMap<>();
                methodInfo.put("name", method.getName());
                methodInfo.put("returnType", method.getReturnType().getSimpleName());
                methodInfo.put("parameterCount", method.getParameterCount());
                return methodInfo;
            })
            .collect(Collectors.toList());

        analysis.put("methods", methodAnalysis);
        analysis.put("methodCount", methodAnalysis.size());

        return analysis;
    }

    public List<Map<String, Object>> generateSampleData(Class<?> modelClass, int count) {
        List<Map<String, Object>> sampleData = new ArrayList<>();
        Field[] fields = modelClass.getDeclaredFields();

        Random random = new Random();
        String[] sampleNames = {"John Doe", "Jane Smith", "Bob Johnson", "Alice Brown", "Charlie Wilson"};
        String[] sampleEmails = {"john@example.com", "jane@example.com", "bob@example.com", "alice@example.com", "charlie@example.com"};
        String[] sampleStatuses = {"active", "pending", "completed", "draft", "published"};
        String[] sampleCategories = {"Technology", "Business", "Education", "Healthcare", "Finance"};

        for (int i = 0; i < count; i++) {
            Map<String, Object> record = new HashMap<>();

            for (Field field : fields) {
                String fieldName = field.getName();
                String fieldType = field.getType().getSimpleName();

                // Generate appropriate sample data based on field name and type
                if (fieldName.toLowerCase().contains("id")) {
                    record.put(fieldName, i + 1);
                } else if (fieldName.toLowerCase().contains("name") || fieldName.toLowerCase().contains("title")) {
                    record.put(fieldName, "Sample " + modelClass.getSimpleName() + " " + (i + 1));
                } else if (fieldName.toLowerCase().contains("email")) {
                    record.put(fieldName, sampleEmails[i % sampleEmails.length]);
                } else if (fieldName.toLowerCase().contains("status")) {
                    record.put(fieldName, sampleStatuses[i % sampleStatuses.length]);
                } else if (fieldName.toLowerCase().contains("category")) {
                    record.put(fieldName, sampleCategories[i % sampleCategories.length]);
                } else if (fieldName.toLowerCase().contains("price") || fieldName.toLowerCase().contains("amount")) {
                    record.put(fieldName, 10.0 + (random.nextDouble() * 90.0));
                } else if (fieldName.toLowerCase().contains("count") || fieldName.toLowerCase().contains("quantity")) {
                    record.put(fieldName, random.nextInt(100) + 1);
                } else if (fieldType.equals("String")) {
                    record.put(fieldName, "Sample " + fieldName + " " + (i + 1));
                } else if (fieldType.equals("int") || fieldType.equals("Integer")) {
                    record.put(fieldName, random.nextInt(1000) + 1);
                } else if (fieldType.equals("double") || fieldType.equals("Double")) {
                    record.put(fieldName, Math.round(random.nextDouble() * 100.0 * 100.0) / 100.0);
                } else if (fieldType.equals("boolean") || fieldType.equals("Boolean")) {
                    record.put(fieldName, random.nextBoolean());
                } else if (fieldType.toLowerCase().contains("date")) {
                    record.put(fieldName, new Date());
                } else {
                    record.put(fieldName, "Sample Value " + (i + 1));
                }
            }

            sampleData.add(record);
        }

        return sampleData;
    }
}
