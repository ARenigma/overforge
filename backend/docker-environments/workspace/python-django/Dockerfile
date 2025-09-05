FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=interview_project.settings

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Install Python dependencies first
COPY requirements.txt /app/
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Create Django project structure (without conflicting files)
RUN django-admin startproject interview_project .
RUN cd interview_project && python ../manage.py startapp interview_app

# Now copy our custom configuration files
COPY settings.py /app/interview_project/settings.py
COPY urls.py /app/interview_project/urls.py
COPY models.py /app/interview_app/models.py
COPY admin.py /app/interview_app/admin.py
COPY interview_middleware.py /app/interview_project/interview_middleware.py
COPY entrypoint.sh /app/

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 8000

# Run Django development server
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"] 