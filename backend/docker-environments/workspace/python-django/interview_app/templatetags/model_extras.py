from django import template

register = template.Library()

@register.filter
def getattr(obj, attr_name):
    """Get attribute value from object dynamically"""
    try:
        return getattr(obj, attr_name, None)
    except:
        return None

@register.filter
def field_value(obj, field_name):
    """Get field value from model instance"""
    try:
        value = getattr(obj, field_name, None)
        if value is None:
            return "[No Value]"
        return str(value)
    except:
        return "[Error]" 