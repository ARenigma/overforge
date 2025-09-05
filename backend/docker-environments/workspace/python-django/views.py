from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.core import serializers
from interview_app.models import Blog
import json

def blog_list(request):
    """Display all blog posts"""
    blogs = Blog.objects.all().order_by('-created_at')
    
    # Return JSON for API endpoints
    if request.path.startswith('/api/'):
        blog_data = []
        for blog in blogs:
            blog_data.append({
                'id': blog.id,
                'title': blog.title,
                'content': blog.content,
                'author': blog.author.username,
                'created_at': blog.created_at.isoformat()
            })
        return JsonResponse({'blogs': blog_data})
    
    # Return HTML template
    return render(request, 'blog/list.html', {'blogs': blogs})

def blog_detail(request, blog_id):
    """Display a single blog post"""
    blog = get_object_or_404(Blog, id=blog_id)
    
    # Return JSON for API endpoints
    if request.path.startswith('/api/'):
        blog_data = {
            'id': blog.id,
            'title': blog.title,
            'content': blog.content,
            'author': blog.author.username,
            'created_at': blog.created_at.isoformat()
        }
        return JsonResponse(blog_data)
    
    # Return HTML template
    return render(request, 'blog/detail.html', {'blog': blog})

def home(request):
    """Home page showing blog summary"""
    blog_count = Blog.objects.count()
    recent_blogs = Blog.objects.all().order_by('-created_at')[:5]
    
    return render(request, 'blog/home.html', {
        'blog_count': blog_count,
        'recent_blogs': recent_blogs
    })

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
