"""
Interview Platform Custom Middleware
Handles iframe permissions and CORS for web preview functionality
"""

import os
from django.http import HttpResponse
from django.utils.deprecation import MiddlewareMixin


class InterviewFrameOptionsMiddleware(MiddlewareMixin):
    """
    Custom middleware to handle X-Frame-Options for iframe embedding in development.
    This replaces Django's default XFrameOptionsMiddleware to allow controlled iframe access.
    """

    def __init__(self, get_response=None):
        super().__init__(get_response)
        # Get environment settings
        self.debug_mode = os.environ.get('DEBUG', 'True').lower() == 'true'
        self.allowed_origins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3001',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
        ]

    def process_response(self, request, response):
        """
        Set X-Frame-Options header based on environment and origin
        """
        # Get the origin from the request
        origin = request.META.get('HTTP_ORIGIN', '')
        referer = request.META.get('HTTP_REFERER', '')

        # In development mode, be more permissive for iframe embedding
        if self.debug_mode:
            # Check if request is from allowed origins
            if any(allowed in origin or allowed in referer for allowed in self.allowed_origins):
                # Allow iframe embedding from our frontend
                response['X-Frame-Options'] = 'SAMEORIGIN'
            else:
                # For direct access or unknown origins, still allow same origin
                response['X-Frame-Options'] = 'SAMEORIGIN'
        else:
            # In production, be more restrictive
            if origin in self.allowed_origins:
                response['X-Frame-Options'] = 'SAMEORIGIN'
            else:
                response['X-Frame-Options'] = 'DENY'

        return response


class InterviewCORSMiddleware(MiddlewareMixin):
    """
    Custom CORS middleware for interview platform.
    Handles CORS headers for API requests and iframe embedding.
    """

    def __init__(self, get_response=None):
        super().__init__(get_response)
        self.debug_mode = os.environ.get('DEBUG', 'True').lower() == 'true'
        self.allowed_origins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3001',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
        ]
        self.allowed_methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
        self.allowed_headers = [
            'accept',
            'accept-encoding',
            'authorization',
            'content-type',
            'dnt',
            'origin',
            'user-agent',
            'x-csrftoken',
            'x-requested-with',
            'cache-control',
        ]

    def process_request(self, request):
        """
        Handle preflight OPTIONS requests
        """
        if request.method == 'OPTIONS':
            origin = request.META.get('HTTP_ORIGIN', '')

            if self.debug_mode or origin in self.allowed_origins:
                response = HttpResponse()
                response['Access-Control-Allow-Origin'] = origin or '*'
                response['Access-Control-Allow-Methods'] = ', '.join(self.allowed_methods)
                response['Access-Control-Allow-Headers'] = ', '.join(self.allowed_headers)
                response['Access-Control-Allow-Credentials'] = 'true'
                response['Access-Control-Max-Age'] = '86400'  # 24 hours
                return response

        return None

    def process_response(self, request, response):
        """
        Add CORS headers to all responses
        """
        origin = request.META.get('HTTP_ORIGIN', '')

        # Set CORS headers
        if self.debug_mode:
            # In development, allow all origins for easier testing
            response['Access-Control-Allow-Origin'] = origin or '*'
        elif origin in self.allowed_origins:
            # In production, only allow specific origins
            response['Access-Control-Allow-Origin'] = origin
        else:
            # No CORS for unknown origins in production
            return response

        response['Access-Control-Allow-Credentials'] = 'true'
        response['Access-Control-Allow-Methods'] = ', '.join(self.allowed_methods)
        response['Access-Control-Allow-Headers'] = ', '.join(self.allowed_headers)

        # Additional headers for iframe embedding
        response['Access-Control-Expose-Headers'] = 'Content-Length, X-JSON'

        return response


class InterviewSecurityMiddleware(MiddlewareMixin):
    """
    Security middleware tailored for the interview platform.
    Balances security with functionality needed for iframe embedding and real-time features.
    """

    def __init__(self, get_response=None):
        super().__init__(get_response)
        self.debug_mode = os.environ.get('DEBUG', 'True').lower() == 'true'

    def process_response(self, request, response):
        """
        Add security headers appropriate for interview platform
        """
        # Content Security Policy - adjusted for iframe embedding
        if self.debug_mode:
            # More permissive CSP for development
            csp_policy = (
                "default-src 'self' 'unsafe-inline' 'unsafe-eval' "
                "http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; "
                "frame-ancestors 'self' http://localhost:* http://127.0.0.1:*; "
                "img-src 'self' data: http://localhost:* http://127.0.0.1:* https:; "
                "font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:*;"
            )
        else:
            # More restrictive CSP for production
            csp_policy = (
                "default-src 'self'; "
                "frame-ancestors 'self'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "script-src 'self';"
            )

        response['Content-Security-Policy'] = csp_policy

        # Other security headers
        if not self.debug_mode:
            response['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
            response['X-Content-Type-Options'] = 'nosniff'
            response['X-XSS-Protection'] = '1; mode=block'
            response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        else:
            # Lighter security headers for development
            response['X-Content-Type-Options'] = 'nosniff'
            response['Referrer-Policy'] = 'no-referrer-when-downgrade'

        return response


class InterviewHealthCheckMiddleware(MiddlewareMixin):
    """
    Simple health check endpoint for container monitoring
    """

    def process_request(self, request):
        """
        Handle health check requests
        """
        if request.path in ['/health', '/health/', '/healthz', '/healthz/']:
            response = HttpResponse('OK', content_type='text/plain')
            response.status_code = 200

            # Add some basic info for debugging
            response['X-Container-Status'] = 'running'
            response['X-Django-Version'] = '5.0.3'
            response['X-Framework'] = 'django'

            return response

        return None
