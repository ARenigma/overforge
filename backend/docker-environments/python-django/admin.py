from django.contrib import admin
from .models import Interview, Candidate, InterviewSession

@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    list_display = ['title', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['title', 'description']
    ordering = ['-created_at']

@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display = ['user', 'email', 'experience_years', 'created_at']
    list_filter = ['experience_years', 'created_at']
    search_fields = ['user__username', 'user__email', 'email']
    ordering = ['-created_at']

@admin.register(InterviewSession)
class InterviewSessionAdmin(admin.ModelAdmin):
    list_display = ['candidate', 'interview', 'status', 'scheduled_at', 'score']
    list_filter = ['status', 'scheduled_at']
    search_fields = ['candidate__user__username', 'interview__title']
    ordering = ['-scheduled_at'] 