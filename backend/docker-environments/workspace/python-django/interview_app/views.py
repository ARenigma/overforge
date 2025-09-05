from django.shortcuts import render, get_object_or_404
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
