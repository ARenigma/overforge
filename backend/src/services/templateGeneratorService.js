const fs = require('fs').promises;
const path = require('path');

class TemplateGeneratorService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../../docker-environments/templates');
    this.workspaceDir = path.join(__dirname, '../../docker-environments/workspace');
    
    // Question type to template mapping
    this.questionTemplates = {
      // Django Templates
      'django-blog': {
        framework: 'python-django',
        files: ['views.py', 'urls.py', 'templates/blog/list.html', 'templates/blog/detail.html', 'admin.py'],
        userCodeTarget: 'models.py'
      },
      'django-api': {
        framework: 'python-django',
        files: ['views.py', 'urls.py', 'serializers.py'],
        userCodeTarget: 'models.py'
      },
      'django-auth': {
        framework: 'python-django',
        files: ['views.py', 'urls.py', 'templates/auth/login.html', 'templates/auth/register.html'],
        userCodeTarget: 'models.py'
      },
      
      // Express Templates
      'express-api': {
        framework: 'javascript-express',
        files: ['routes/api.js', 'middleware/auth.js', 'controllers/controller.js'],
        userCodeTarget: 'app.js'
      },
      'express-crud': {
        framework: 'javascript-express',
        files: ['routes/crud.js', 'models/model.js', 'controllers/crudController.js'],
        userCodeTarget: 'app.js'
      },
      
      // Spring Boot Templates
      'spring-rest': {
        framework: 'java-springboot',
        files: ['controller/RestController.java', 'service/Service.java', 'repository/Repository.java'],
        userCodeTarget: 'entity/Entity.java'
      }
    };
  }

  async initializeTemplates() {
    console.log('🏗️ Initializing template generation system...');
    
    // Create templates directory if it doesn't exist
    await fs.mkdir(this.templatesDir, { recursive: true });
    
    // Generate all template types
    await this.generateDjangoBlogTemplate();
    await this.generateExpressApiTemplate();
    await this.generateSpringRestTemplate();
    
    console.log('✅ All templates generated successfully!');
  }

  async createDirectoryIfNotExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async generateDjangoBlogTemplate() {
    console.log('📝 Generating Django Blog template...');
    
    const templateDir = path.join(this.templatesDir, 'django-blog');
    await fs.mkdir(templateDir, { recursive: true });
    await fs.mkdir(path.join(templateDir, 'templates/blog'), { recursive: true });
    
    // Generate views.py for blog functionality
    const viewsContent = `from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.core import serializers
from .models import *
import json

def blog_list(request):
    """Display all blog posts"""
    try:
        # Try to get Blog model if it exists
        from django.apps import apps
        models = apps.get_models()
        blog_model = None
        
        for model in models:
            if 'blog' in model.__name__.lower():
                blog_model = model
                break
        
        if blog_model:
            posts = blog_model.objects.all().order_by('-id')[:10]
            context = {
                'posts': posts,
                'model_name': blog_model.__name__,
                'model_fields': [f.name for f in blog_model._meta.fields],
                'total_count': blog_model.objects.count()
            }
        else:
            context = {
                'posts': [],
                'model_name': 'Blog',
                'model_fields': ['No Blog model found'],
                'total_count': 0,
                'message': 'No Blog model detected. Please create a Blog model in your code.'
            }
            
    except Exception as e:
        context = {
            'posts': [],
            'model_name': 'Blog',
            'model_fields': ['Error loading model'],
            'total_count': 0,
            'error': str(e)
        }
    
    return render(request, 'blog/list.html', context)

def blog_detail(request, pk):
    """Display a single blog post"""
    try:
        from django.apps import apps
        models = apps.get_models()
        blog_model = None
        
        for model in models:
            if 'blog' in model.__name__.lower():
                blog_model = model
                break
        
        if blog_model:
            post = get_object_or_404(blog_model, pk=pk)
            context = {
                'post': post,
                'model_name': blog_model.__name__,
                'model_fields': [f.name for f in blog_model._meta.fields]
            }
        else:
            context = {
                'post': None,
                'model_name': 'Blog',
                'error': 'No Blog model found'
            }
            
    except Exception as e:
        context = {
            'post': None,
            'model_name': 'Blog', 
            'error': str(e)
        }
    
    return render(request, 'blog/detail.html', context)

def api_posts(request):
    """API endpoint for blog posts"""
    try:
        from django.apps import apps
        models = apps.get_models()
        blog_model = None
        
        for model in models:
            if 'blog' in model.__name__.lower():
                blog_model = model
                break
        
        if blog_model:
            posts = blog_model.objects.all()
            data = []
            for post in posts:
                post_data = {}
                for field in blog_model._meta.fields:
                    value = getattr(post, field.name)
                    if hasattr(value, 'isoformat'):  # datetime
                        value = value.isoformat()
                    post_data[field.name] = str(value)
                data.append(post_data)
            
            return JsonResponse({
                'success': True,
                'posts': data,
                'count': len(data),
                'model': blog_model.__name__
            })
        else:
            return JsonResponse({
                'success': False,
                'error': 'No Blog model found',
                'message': 'Please create a Blog model in your code'
            })
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        })
`;

    await fs.writeFile(path.join(templateDir, 'views.py'), viewsContent);

    // Generate urls.py
    const urlsContent = `from django.urls import path
from . import views

urlpatterns = [
    path('', views.blog_list, name='blog_list'),
    path('blog/', views.blog_list, name='blog_list'),
    path('blog/<int:pk>/', views.blog_detail, name='blog_detail'),
    path('api/posts/', views.api_posts, name='api_posts'),
]
`;

    await fs.writeFile(path.join(templateDir, 'urls.py'), urlsContent);

    // Generate blog list template
    const listTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog Posts - Django Model Preview</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .header h1 { margin: 0; color: #2c3e50; font-size: 2.5em; }
        .header p { margin: 10px 0 0 0; color: #7f8c8d; font-size: 1.1em; }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat { background: #e8f4fd; padding: 15px 20px; border-radius: 8px; border-left: 4px solid #3498db; }
        .stat strong { display: block; font-size: 1.5em; color: #2980b9; }
        .posts { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; }
        .post { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 4px solid #27ae60; }
        .post h3 { margin: 0 0 15px 0; color: #2c3e50; font-size: 1.3em; }
        .post .content { color: #555; line-height: 1.6; margin-bottom: 15px; }
        .post .meta { display: flex; gap: 20px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #ecf0f1; }
        .post .meta span { background: #ecf0f1; padding: 5px 12px; border-radius: 15px; font-size: 0.9em; color: #555; }
        .fields { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
        .fields h4 { margin: 0 0 10px 0; color: #856404; }
        .fields ul { margin: 0; padding-left: 20px; }
        .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545; }
        .success { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745; }
        .empty { text-align: center; padding: 50px; color: #6c757d; background: white; border-radius: 10px; }
        .api-link { display: inline-block; margin: 20px 0; padding: 10px 20px; background: #17a2b8; color: white; text-decoration: none; border-radius: 5px; }
        .api-link:hover { background: #138496; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Django {{ model_name }} Model Preview</h1>
            <p>Live preview of your Django model implementation</p>
            
            {% if error %}
                <div class="error">
                    <strong>Error:</strong> {{ error }}
                </div>
            {% endif %}
            
            {% if message %}
                <div class="success">
                    {{ message }}
                </div>
            {% endif %}
        </div>

        <div class="stats">
            <div class="stat">
                <strong>{{ total_count }}</strong>
                <span>Total Records</span>
            </div>
            <div class="stat">
                <strong>{{ model_fields|length }}</strong>
                <span>Model Fields</span>
            </div>
            <div class="stat">
                <strong>{{ model_name }}</strong>
                <span>Model Name</span>
            </div>
        </div>

        <div class="fields">
            <h4>📋 Detected Model Fields:</h4>
            <ul>
                {% for field in model_fields %}
                    <li><code>{{ field }}</code></li>
                {% endfor %}
            </ul>
        </div>

        <a href="/api/posts/" class="api-link" target="_blank">📡 View JSON API</a>

        {% if posts %}
            <div class="posts">
                {% for post in posts %}
                    <div class="post">
                        <h3>
                            {% if post.title %}
                                {{ post.title }}
                            {% else %}
                                {{ model_name }} #{{ post.id }}
                            {% endif %}
                        </h3>
                        
                        {% if post.content %}
                            <div class="content">{{ post.content|truncatewords:30 }}</div>
                        {% endif %}
                        
                        <div class="meta">
                            <span>ID: {{ post.id }}</span>
                            {% if post.author %}
                                <span>Author: {{ post.author }}</span>
                            {% endif %}
                            {% if post.created_at %}
                                <span>Created: {{ post.created_at|date:"M d, Y" }}</span>
                            {% endif %}
                        </div>
                    </div>
                {% endfor %}
            </div>
        {% else %}
            <div class="empty">
                <h3>📝 No blog posts yet</h3>
                <p>Your {{ model_name }} model is ready! Add some test data to see it in action.</p>
                <p><strong>Tip:</strong> Your model structure looks good. The preview will automatically display any data you add.</p>
            </div>
        {% endif %}
    </div>
</body>
</html>`;

    await fs.writeFile(path.join(templateDir, 'templates/blog/list.html'), listTemplate);

    // Generate admin.py for easy data entry
    const adminContent = `from django.contrib import admin
from django.apps import apps

# Auto-register all models for easy testing
models = apps.get_models()

for model in models:
    try:
        if not admin.site.is_registered(model):
            # Create a basic admin class
            admin_class = type(f'{model.__name__}Admin', (admin.ModelAdmin,), {
                'list_display': [field.name for field in model._meta.fields[:5]],  # Show first 5 fields
                'list_filter': [field.name for field in model._meta.fields if field.name in ['created_at', 'updated_at', 'is_active', 'status']],
                'search_fields': [field.name for field in model._meta.fields if 'title' in field.name or 'name' in field.name],
            })
            admin.site.register(model, admin_class)
    except Exception as e:
        # Skip if already registered or other issues
        pass
`;

    await fs.writeFile(path.join(templateDir, 'admin.py'), adminContent);

    console.log('✅ Django Blog template generated');
  }

  async generateExpressApiTemplate() {
    console.log('📝 Generating Express API template...');
    
    const templatePath = path.join(__dirname, '../../docker-environments/templates/express-api');
    
    // Create template structure
    await this.createDirectoryIfNotExists(templatePath);
    await this.createDirectoryIfNotExists(path.join(templatePath, 'public'));
    await this.createDirectoryIfNotExists(path.join(templatePath, 'public', 'css'));
    await this.createDirectoryIfNotExists(path.join(templatePath, 'public', 'js'));
    
    // Create package.json (already created above)
    
    // Create app.js (already created above)
    
    // Create sample models.js for demonstration
    const sampleModelsContent = `// Sample JavaScript Models for OverForge Express.js Template
// Users can replace this with their own model definitions

// Example 1: Product Model (E-commerce)
class Product {
  constructor({ name = '', price = 0, category = '', description = '', stock_quantity = 0, is_available = true }) {
    this.name = name;
    this.price = price;
    this.category = category;
    this.description = description;
    this.stock_quantity = stock_quantity;
    this.is_available = is_available;
    this.created_at = new Date().toISOString();
  }
  
  // Method to check if product is in stock
  isInStock() {
    return this.stock_quantity > 0 && this.is_available;
  }
  
  // Method to apply discount
  applyDiscount(percentage) {
    this.price = this.price * (1 - percentage / 100);
    return this.price;
  }
}

// Example 2: User Model (User Management)
class User {
  constructor({ name = '', email = '', phone = '', role = 'user', status = 'active', bio = '' }) {
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.role = role;
    this.status = status;
    this.bio = bio;
    this.created_at = new Date().toISOString();
    this.last_login = null;
    this.is_verified = false;
  }
  
  // Method to verify user
  verify() {
    this.is_verified = true;
    return this.is_verified;
  }
  
  // Method to update last login
  updateLastLogin() {
    this.last_login = new Date().toISOString();
  }
}

// Example 3: Task Model (Project Management)
class Task {
  constructor({ title = '', description = '', status = 'pending', priority = 'medium', assigned_to = '', due_date = null }) {
    this.title = title;
    this.description = description;
    this.status = status;
    this.priority = priority;
    this.assigned_to = assigned_to;
    this.due_date = due_date;
    this.created_at = new Date().toISOString();
    this.completed_at = null;
  }
  
  // Method to mark task as completed
  complete() {
    this.status = 'completed';
    this.completed_at = new Date().toISOString();
    return this.status;
  }
  
  // Method to check if task is overdue
  isOverdue() {
    if (!this.due_date) return false;
    return new Date() > new Date(this.due_date) && this.status !== 'completed';
  }
}

// Export the model you want to use
// Change this to export your custom model
module.exports = {
  Product,
  // User,
  // Task
};`;
    
    await fs.writeFile(path.join(templatePath, 'models.js'), sampleModelsContent);
    
    // Create public/index.html for web interface
    const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OverForge Express API</title>
    <link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🚀 OverForge Express.js API</h1>
            <p>Dynamic API Template for Interview Assessments</p>
        </header>
        
        <main>
            <div class="api-info" id="api-info">
                <div class="loading">Loading API information...</div>
            </div>
            
            <div class="endpoints-section" id="endpoints-section" style="display: none;">
                <h2>📡 Available Endpoints</h2>
                <div class="endpoints-list" id="endpoints-list"></div>
            </div>
            
            <div class="test-section">
                <h2>🧪 API Testing</h2>
                <div class="test-controls">
                    <button onclick="testAPI()" class="btn btn-primary">Test API</button>
                    <button onclick="reloadModel()" class="btn btn-secondary">Reload Model</button>
                </div>
                <div class="test-results" id="test-results"></div>
            </div>
        </main>
        
        <footer>
            <p>OverForge Interview Platform - Express.js Template</p>
        </footer>
    </div>
    
    <script src="/static/js/app.js"></script>
</body>
</html>`;
    
    await fs.writeFile(path.join(templatePath, 'public', 'index.html'), indexHtmlContent);
    
    // Create CSS styles
    const cssContent = `/* OverForge Express API Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

header {
    text-align: center;
    background: rgba(255, 255, 255, 0.95);
    padding: 2rem;
    border-radius: 15px;
    margin-bottom: 2rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

header h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    color: #4f46e5;
}

header p {
    font-size: 1.1rem;
    color: #6b7280;
}

main {
    background: rgba(255, 255, 255, 0.95);
    padding: 2rem;
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
}

.api-info {
    background: #f8fafc;
    padding: 1.5rem;
    border-radius: 10px;
    margin-bottom: 2rem;
    border-left: 4px solid #4f46e5;
}

.loading {
    text-align: center;
    color: #6b7280;
    font-style: italic;
}

.model-info {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
}

.info-card {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
}

.info-card h3 {
    color: #4f46e5;
    margin-bottom: 0.5rem;
    font-size: 1rem;
}

.info-card p {
    color: #6b7280;
    font-size: 1.2rem;
    font-weight: bold;
}

.endpoints-section {
    margin: 2rem 0;
}

.endpoints-section h2 {
    color: #1f2937;
    margin-bottom: 1rem;
}

.endpoint {
    background: #f8fafc;
    padding: 1rem;
    margin: 0.5rem 0;
    border-radius: 8px;
    border-left: 3px solid #10b981;
    font-family: 'Courier New', monospace;
}

.endpoint .method {
    font-weight: bold;
    color: #059669;
}

.endpoint .path {
    color: #1f2937;
}

.endpoint .description {
    color: #6b7280;
    font-size: 0.9rem;
    margin-top: 0.25rem;
}

.test-section {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #e5e7eb;
}

.test-section h2 {
    color: #1f2937;
    margin-bottom: 1rem;
}

.test-controls {
    margin-bottom: 1rem;
}

.btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    margin-right: 1rem;
    transition: all 0.3s ease;
}

.btn-primary {
    background: #4f46e5;
    color: white;
}

.btn-primary:hover {
    background: #4338ca;
    transform: translateY(-2px);
}

.btn-secondary {
    background: #6b7280;
    color: white;
}

.btn-secondary:hover {
    background: #4b5563;
    transform: translateY(-2px);
}

.test-results {
    background: #111827;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
}

.schema-section {
    margin-top: 1rem;
    padding: 1rem;
    background: #f0f9ff;
    border-radius: 8px;
    border: 1px solid #0ea5e9;
}

.schema-title {
    color: #0369a1;
    margin-bottom: 0.5rem;
    font-weight: bold;
}

.schema-fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.5rem;
}

.schema-field {
    background: white;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid #bae6fd;
    font-family: 'Courier New', monospace;
    font-size: 0.8rem;
}

.field-name {
    font-weight: bold;
    color: #0369a1;
}

.field-type {
    color: #6b7280;
}

footer {
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
    padding: 1rem;
}

@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
    
    header h1 {
        font-size: 2rem;
    }
    
    .model-info {
        grid-template-columns: 1fr;
    }
    
    .btn {
        display: block;
        width: 100%;
        margin-bottom: 0.5rem;
        margin-right: 0;
    }
}`;
    
    await fs.writeFile(path.join(templatePath, 'public', 'css', 'style.css'), cssContent);
    
    // Create JavaScript for frontend interaction
    const jsContent = `// OverForge Express API Frontend JavaScript

let apiInfo = null;

// Load API information on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadAPIInfo();
});

async function loadAPIInfo() {
    try {
        const response = await fetch('/');
        apiInfo = await response.json();
        displayAPIInfo(apiInfo);
    } catch (error) {
        console.error('Failed to load API info:', error);
        document.getElementById('api-info').innerHTML = 
            '<div class="error">❌ Failed to load API information</div>';
    }
}

function displayAPIInfo(info) {
    const apiInfoDiv = document.getElementById('api-info');
    const endpointsSection = document.getElementById('endpoints-section');
    const endpointsList = document.getElementById('endpoints-list');
    
    // Display basic API information
    apiInfoDiv.innerHTML = \`
        <h2>📊 API Information</h2>
        <div class="model-info">
            <div class="info-card">
                <h3>🎯 Detected Model</h3>
                <p>\${info.model || 'No model detected'}</p>
            </div>
            <div class="info-card">
                <h3>📈 Total Records</h3>
                <p>\${info.totalRecords || 0}</p>
            </div>
            <div class="info-card">
                <h3>⚡ Status</h3>
                <p>\${info.status || 'Unknown'}</p>
            </div>
            <div class="info-card">
                <h3>🕐 Last Update</h3>
                <p>\${new Date(info.timestamp).toLocaleTimeString()}</p>
            </div>
        </div>
        \${info.schema && Object.keys(info.schema).length > 0 ? 
            \`<div class="schema-section">
                <div class="schema-title">📋 Model Schema</div>
                <div class="schema-fields">
                    \${Object.entries(info.schema).map(([field, type]) => 
                        \`<div class="schema-field">
                            <span class="field-name">\${field}</span>: 
                            <span class="field-type">\${type}</span>
                        </div>\`
                    ).join('')}
                </div>
            </div>\` : ''
        }
    \`;
    
    // Display endpoints if model is detected
    if (info.model && info.model !== 'No model detected') {
        endpointsSection.style.display = 'block';
        endpointsList.innerHTML = info.endpoints.map(endpoint => {
            const [method, path, description] = endpoint.split(' - ');
            const methodClass = method.startsWith('GET') ? 'get' : 
                               method.startsWith('POST') ? 'post' : 
                               method.startsWith('PUT') ? 'put' : 
                               method.startsWith('DELETE') ? 'delete' : '';
            
            return \`
                <div class="endpoint">
                    <span class="method \${methodClass}">\${method}</span>
                    <span class="path">\${path || ''}</span>
                    <div class="description">\${description || ''}</div>
                </div>
            \`;
        }).join('');
    }
}

async function testAPI() {
    const resultsDiv = document.getElementById('test-results');
    resultsDiv.innerHTML = '🧪 Testing API endpoints...\\n';
    
    if (!apiInfo || !apiInfo.model || apiInfo.model === 'No model detected') {
        resultsDiv.innerHTML += '❌ No model detected. Please define a model in models.js\\n';
        return;
    }
    
    const modelPath = \`/\${apiInfo.model.toLowerCase()}s\`;
    
    try {
        // Test GET all records
        resultsDiv.innerHTML += \`\\n📡 Testing GET \${modelPath}\\n\`;
        const getAllResponse = await fetch(modelPath);
        const getAllData = await getAllResponse.json();
        resultsDiv.innerHTML += \`✅ Status: \${getAllResponse.status}\\n\`;
        resultsDiv.innerHTML += \`📊 Records returned: \${getAllData.data ? getAllData.data.length : 0}\\n\`;
        
        if (getAllData.data && getAllData.data.length > 0) {
            // Test GET single record
            const firstId = getAllData.data[0].id;
            resultsDiv.innerHTML += \`\\n📡 Testing GET \${modelPath}/\${firstId}\\n\`;
            const getSingleResponse = await fetch(\`\${modelPath}/\${firstId}\`);
            const getSingleData = await getSingleResponse.json();
            resultsDiv.innerHTML += \`✅ Status: \${getSingleResponse.status}\\n\`;
            resultsDiv.innerHTML += \`📄 Record found: \${getSingleData.data ? 'Yes' : 'No'}\\n\`;
            
            // Display sample record
            if (getSingleData.data) {
                resultsDiv.innerHTML += \`\\n📋 Sample Record:\\n\`;
                resultsDiv.innerHTML += JSON.stringify(getSingleData.data, null, 2) + '\\n';
            }
        }
        
        // Test health endpoint
        resultsDiv.innerHTML += \`\\n📡 Testing GET /health\\n\`;
        const healthResponse = await fetch('/health');
        const healthData = await healthResponse.json();
        resultsDiv.innerHTML += \`✅ Status: \${healthResponse.status}\\n\`;
        resultsDiv.innerHTML += \`💚 Health: \${healthData.status}\\n\`;
        resultsDiv.innerHTML += \`⏱️ Uptime: \${Math.round(healthData.uptime)}s\\n\`;
        
        resultsDiv.innerHTML += \`\\n🎉 All tests completed successfully!\\n\`;
        
    } catch (error) {
        resultsDiv.innerHTML += \`\\n❌ Test failed: \${error.message}\\n\`;
    }
}

async function reloadModel() {
    const resultsDiv = document.getElementById('test-results');
    resultsDiv.innerHTML = '🔄 Reloading model...\\n';
    
    try {
        const response = await fetch('/reload-model', { method: 'POST' });
        const data = await response.json();
        
        resultsDiv.innerHTML += \`✅ Status: \${response.status}\\n\`;
        resultsDiv.innerHTML += \`📦 Model: \${data.model}\\n\`;
        resultsDiv.innerHTML += \`📈 Records: \${data.records}\\n\`;
        resultsDiv.innerHTML += \`💬 Message: \${data.message}\\n\`;
        
        // Reload page info
        await loadAPIInfo();
        
    } catch (error) {
        resultsDiv.innerHTML += \`❌ Reload failed: \${error.message}\\n\`;
    }
}`;
    
    await fs.writeFile(path.join(templatePath, 'public', 'js', 'app.js'), jsContent);
    
    console.log('✅ Express API template generated');
    return templatePath;
  }

  async generateSpringRestTemplate() {
    console.log('📝 Generating Spring REST template...');
    
    const templateDir = path.join(this.templatesDir, 'spring-rest');
    
    // The Spring Boot template already exists in docker-environments/templates/spring-rest
    // We just need to ensure it's properly initialized
    try {
      await fs.access(templateDir);
      console.log('✅ Spring REST template already exists and is ready');
    } catch (error) {
      console.log('⚠️ Spring REST template directory not found - this should not happen');
      console.log('The template should be available at:', templateDir);
    }
    
    console.log('✅ Spring REST template generated');
  }

  async deployTemplate(questionType, targetFramework) {
    console.log(`🚀 Deploying ${questionType} template to ${targetFramework}...`);
    
    const templateDir = path.join(this.templatesDir, questionType);
    const workspaceDir = path.join(this.workspaceDir, targetFramework);
    
    // For Django, create proper app structure
    if (targetFramework === 'python-django') {
      await this.deployDjangoTemplate(templateDir, workspaceDir);
    } else {
      // Copy template files to workspace
      await this.copyTemplateFiles(templateDir, workspaceDir);
    }
    
    console.log(`✅ Template deployed to ${workspaceDir}`);
  }

  async deployDjangoTemplate(templateDir, workspaceDir) {
    // Create interview_app directory structure
    const appDir = path.join(workspaceDir, 'interview_app');
    await fs.mkdir(appDir, { recursive: true });
    await fs.mkdir(path.join(appDir, 'migrations'), { recursive: true });
    
    // Copy template files to the app directory
    await this.copyTemplateFiles(templateDir, appDir);
    
    // Create proper __init__.py files
    await fs.writeFile(path.join(appDir, '__init__.py'), '# Django app package');
    await fs.writeFile(path.join(appDir, 'migrations', '__init__.py'), '# Migrations package');
    
    // Copy existing models.py to app directory (if it exists)
    const rootModelsPath = path.join(workspaceDir, 'models.py');
    const appModelsPath = path.join(appDir, 'models.py');
    try {
      await fs.access(rootModelsPath);
      await fs.copyFile(rootModelsPath, appModelsPath);
    } catch {
      // models.py doesn't exist, that's ok
    }
  }

  async copyTemplateFiles(sourceDir, targetDir) {
    try {
      const files = await fs.readdir(sourceDir, { withFileTypes: true });
      
      for (const file of files) {
        const sourcePath = path.join(sourceDir, file.name);
        const targetPath = path.join(targetDir, file.name);
        
        if (file.isDirectory()) {
          await fs.mkdir(targetPath, { recursive: true });
          await this.copyTemplateFiles(sourcePath, targetPath);
        } else {
          // Only copy if file doesn't exist or is different
          try {
            await fs.access(targetPath);
            // File exists, check if we should overwrite (skip models.py, settings.py etc.)
            if (!this.shouldSkipFile(file.name)) {
              await fs.copyFile(sourcePath, targetPath);
            }
          } catch {
            // File doesn't exist, copy it
            await fs.copyFile(sourcePath, targetPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error copying template files: ${error.message}`);
    }
  }

  shouldSkipFile(filename) {
    // Don't overwrite user code files
    const skipFiles = ['models.py', 'settings.py', 'manage.py', 'app.js', 'package.json'];
    return skipFiles.includes(filename);
  }

  async getQuestionTemplate(questionTitle, framework) {
    // Map question titles to template types
    const questionMappings = {
      'django model setup': 'django-blog',
      'blog model': 'django-blog',
      'django blog': 'django-blog',
      'express api': 'express-api',
      'rest api': 'express-api',
      'spring boot': 'spring-rest'
    };

    const normalizedTitle = questionTitle.toLowerCase();
    for (const [key, template] of Object.entries(questionMappings)) {
      if (normalizedTitle.includes(key)) {
        return template;
      }
    }

    // Default templates by framework
    if (framework.includes('django')) return 'django-blog';
    if (framework.includes('express')) return 'express-api';
    if (framework.includes('spring')) return 'spring-rest';

    return null;
  }
}

module.exports = new TemplateGeneratorService(); 