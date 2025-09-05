# Use a standard Python runtime
FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Copy the source code into the container
COPY ./workspace/python-core /app

# No compilation needed for Python, just set the run command
CMD ["python", "app.py"]