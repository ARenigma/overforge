from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('blogs/', views.blog_list, name='blog_list'),
    path('blogs/<int:blog_id>/', views.blog_detail, name='blog_detail'),
    path('api/blogs/', views.blog_list, name='api_blog_list'),
    path('api/blogs/<int:blog_id>/', views.blog_detail, name='api_blog_detail'),
]
