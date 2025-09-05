# OverForge Spring Boot REST API Template

This template provides a fully functional Spring Boot environment that can dynamically compile and run a user-provided Java model.

## How It Works

1.  **Define Your Model**: Create your Java class (POJO or JPA Entity) in `src/main/java/com/overforge/interview/model/`. You can replace the existing `Product.java` file or create a new one. The system will automatically find the first `.java` file in this directory.
2.  **Run**: The system compiles your Java file at runtime.
3.  **Analyze**: It uses reflection to understand your model's fields and methods.
4.  **Generate Data**: It uses the `javafaker` library to create realistic sample data for your model.
5.  **Serve API**: It exposes REST endpoints to view the model's schema and the generated data.

## Available API Endpoints

-   `GET /api/info`: Shows a summary of the detected model, its schema, and available endpoints.
-   `GET /api/data`: Returns a list of 5 randomly generated sample records for your model.
-   `POST /api/reload`: Clears all caches and re-compiles/re-analyzes your model file. Use this if you make changes and want to see them without restarting the whole container.
-   `GET /h2-console`: Access the in-memory H2 database console. (JDBC URL: `jdbc:h2:mem:interviewdb`)

## Recommendations

-   Include a no-argument constructor in your model class.
-   Use standard getters and setters for fields you want to be serialized in the JSON output.
-   Feel free to use JPA annotations like `@Entity`, `@Id`, etc. The system will work with them.
-   You can also add custom methods to your model. They will be detected and listed in the schema. 