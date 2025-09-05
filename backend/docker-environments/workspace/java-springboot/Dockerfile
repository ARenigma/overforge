# Use a base image with Java and Maven
FROM openjdk:17-slim

# Install Maven
RUN apt-get update && apt-get install -y maven

# Set up a working directory
WORKDIR /app

# Copy the template project into the image
COPY ./template_project /app/template_project

# Set the default command to keep container running
CMD ["tail", "-f", "/dev/null"] 