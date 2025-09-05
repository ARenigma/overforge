from django.db import models
from django.contrib.auth.models import User

class Interview(models.Model):
    """Sample Interview model for Django problems"""
    title = models.CharField(max_length=200)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title

class Candidate(models.Model):
    """Sample Candidate model for Django problems"""
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    email = models.EmailField()
    phone = models.CharField(max_length=15, blank=True)
    experience_years = models.PositiveIntegerField(default=0)
    skills = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.user.first_name} {self.user.last_name}"

class InterviewSession(models.Model):
    """Sample InterviewSession model for Django problems"""
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE)
    interview = models.ForeignKey(Interview, on_delete=models.CASCADE)
    scheduled_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=[
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ], default='scheduled')
    notes = models.TextField(blank=True)
    score = models.PositiveIntegerField(null=True, blank=True)
    
    class Meta:
        unique_together = ['candidate', 'interview']
    
    def __str__(self):
        return f"{self.candidate} - {self.interview.title}" 