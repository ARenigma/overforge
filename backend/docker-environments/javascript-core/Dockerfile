# Use a standard Node.js runtime
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy the source code into the container
COPY ./workspace/javascript-core /app

# No compilation needed for JavaScript, just set the run command
CMD ["node", "app.js"] 