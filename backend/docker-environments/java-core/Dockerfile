# Use a standard Java runtime
FROM openjdk:17-slim

# Set the working directory
WORKDIR /app

# Copy the source code into the container
COPY ./workspace/java-core /app

# Compile any .java files in the source directory, but only if they exist
# RUN find . -name "*.java" -print0 | xargs -0 -r javac

# Set the command to run the main class
CMD ["tail", "-f", "/dev/null"] 