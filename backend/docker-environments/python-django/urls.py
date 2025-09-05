from django.contrib import admin
from django.urls import path
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({
        'status': 'healthy',
        'environment': 'Django Interview Environment',
        'message': 'Ready for coding interviews!'
    })

def home_view(request):
    return JsonResponse({
        'message': 'Welcome to Django Interview Environment',
        'admin_url': '/admin/',
        'health_url': '/health/',
        'login': 'admin / interview123'
    })

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health_check, name='health'),
    path('', home_view, name='home'),
] 