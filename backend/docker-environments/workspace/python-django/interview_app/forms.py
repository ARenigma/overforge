from django import forms
from django.contrib.auth.models import User
from django.apps import apps

class AdaptiveModelForm(forms.Form):
    """
    A dynamic form that adapts to any user-defined model
    """
    
    def __init__(self, model_class=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        if model_class:
            self.model_class = model_class
            self.create_fields_for_model()
    
    def create_fields_for_model(self):
        """Dynamically create form fields based on model fields"""
        for field in self.model_class._meta.fields:
            if field.name == 'id':
                continue  # Skip ID field
                
            field_type = field.get_internal_type()
            field_name = field.name
            
            # Create appropriate form field based on model field type
            if field_type == 'CharField':
                max_length = getattr(field, 'max_length', 100)
                self.fields[field_name] = forms.CharField(
                    label=field.verbose_name or field_name.title(),
                    max_length=max_length,
                    required=not field.blank,
                    widget=forms.TextInput(attrs={
                        'class': 'form-control',
                        'placeholder': f'Enter {field.verbose_name or field_name}'
                    })
                )
                
            elif field_type == 'TextField':
                self.fields[field_name] = forms.CharField(
                    label=field.verbose_name or field_name.title(),
                    required=not field.blank,
                    widget=forms.Textarea(attrs={
                        'class': 'form-control',
                        'rows': 4,
                        'placeholder': f'Enter {field.verbose_name or field_name}'
                    })
                )
                
            elif field_type == 'EmailField':
                self.fields[field_name] = forms.EmailField(
                    label=field.verbose_name or field_name.title(),
                    required=not field.blank,
                    widget=forms.EmailInput(attrs={
                        'class': 'form-control',
                        'placeholder': 'Enter email address'
                    })
                )
                
            elif field_type == 'IntegerField':
                self.fields[field_name] = forms.IntegerField(
                    label=field.verbose_name or field_name.title(),
                    required=not field.blank,
                    widget=forms.NumberInput(attrs={
                        'class': 'form-control',
                        'placeholder': f'Enter {field.verbose_name or field_name}'
                    })
                )
                
            elif field_type == 'DecimalField':
                self.fields[field_name] = forms.DecimalField(
                    label=field.verbose_name or field_name.title(),
                    required=not field.blank,
                    widget=forms.NumberInput(attrs={
                        'class': 'form-control',
                        'step': '0.01',
                        'placeholder': f'Enter {field.verbose_name or field_name}'
                    })
                )
                
            elif field_type == 'BooleanField':
                self.fields[field_name] = forms.BooleanField(
                    label=field.verbose_name or field_name.title(),
                    required=False,
                    widget=forms.CheckboxInput(attrs={
                        'class': 'form-check-input'
                    })
                )
                
            elif field_type == 'DateField':
                self.fields[field_name] = forms.DateField(
                    label=field.verbose_name or field_name.title(),
                    required=not field.blank,
                    widget=forms.DateInput(attrs={
                        'class': 'form-control',
                        'type': 'date'
                    })
                )
                
            elif field_type == 'DateTimeField':
                # Skip auto fields
                if hasattr(field, 'auto_now_add') and field.auto_now_add:
                    continue
                if hasattr(field, 'auto_now') and field.auto_now:
                    continue
                    
                self.fields[field_name] = forms.DateTimeField(
                    label=field.verbose_name or field_name.title(),
                    required=not field.blank,
                    widget=forms.DateTimeInput(attrs={
                        'class': 'form-control',
                        'type': 'datetime-local'
                    })
                )
                
            elif field_type == 'ForeignKey':
                # Handle ForeignKey fields
                try:
                    related_model = field.related_model
                    if related_model == User:
                        self.fields[field_name] = forms.ModelChoiceField(
                            queryset=User.objects.all(),
                            label=field.verbose_name or field_name.title(),
                            required=not field.blank,
                            widget=forms.Select(attrs={
                                'class': 'form-control'
                            })
                        )
                    else:
                        self.fields[field_name] = forms.ModelChoiceField(
                            queryset=related_model.objects.all(),
                            label=field.verbose_name or field_name.title(),
                            required=not field.blank,
                            widget=forms.Select(attrs={
                                'class': 'form-control'
                            })
                        )
                except:
                    # Fallback to text input if ForeignKey handling fails
                    self.fields[field_name] = forms.CharField(
                        label=field.verbose_name or field_name.title(),
                        required=not field.blank,
                        widget=forms.TextInput(attrs={
                            'class': 'form-control',
                            'placeholder': f'Enter {field_name} ID'
                        })
                    )
    
    def save(self, commit=True):
        """Save the form data to create a new model instance"""
        if not hasattr(self, 'model_class'):
            raise ValueError("No model class specified")
            
        # Create instance with cleaned data
        instance = self.model_class()
        
        for field_name, value in self.cleaned_data.items():
            if hasattr(instance, field_name):
                setattr(instance, field_name, value)
        
        if commit:
            instance.save()
            
        return instance


class QuickBlogForm(forms.Form):
    """
    A specific form for Blog/Article models for quick testing
    """
    title = forms.CharField(
        max_length=200,
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Enter blog title'
        })
    )
    
    content = forms.CharField(
        widget=forms.Textarea(attrs={
            'class': 'form-control',
            'rows': 6,
            'placeholder': 'Write your blog content here...'
        })
    )
    
    author = forms.ModelChoiceField(
        queryset=User.objects.all(),
        widget=forms.Select(attrs={
            'class': 'form-control'
        }),
        empty_label="Select an author"
    )
    
    def save(self, model_class):
        """Save to the specified model class"""
        instance = model_class()
        instance.title = self.cleaned_data['title']
        instance.content = self.cleaned_data['content']
        instance.author = self.cleaned_data['author']
        instance.save()
        return instance 