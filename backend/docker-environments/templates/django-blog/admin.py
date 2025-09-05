from django.contrib import admin
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
