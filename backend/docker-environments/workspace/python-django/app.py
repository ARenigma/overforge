# Sample Django Model for Testing
# This file can be used to define models for testing the adaptive system.

from django.db import models
from django.contrib.auth.models import User
from django.urls import reverse

# Instructions for testing:
"""
To test the adaptive system:

1. Define a Django model below (or modify an existing one).
2. The system will automatically detect your models and provide an interactive preview.

Example Model:
"""

class Article(models.Model):
    """An example Article model"""
    title = models.CharField(max_length=200, help_text="Article title")
    content = models.TextField(help_text="Article content")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='articles')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.title

# Instructions for User-Defined Forms:
"""
You can also define your own forms.

1. Define a class inheriting from forms.Form or forms.ModelForm.
2. The system will automatically detect and render your form in the preview.

Example Form:
"""

# from django import forms
#
# class ContactForm(forms.Form):
#    name = forms.CharField(max_length=100)
#    email = forms.EmailField()
#    message = forms.CharField(widget=forms.Textarea) 