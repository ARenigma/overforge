#!/usr/bin/env python3

import os
import sys
import json
import traceback
import importlib.util
from flask import Flask, jsonify, request
from adaptive_analyzer import PythonCoreAnalyzer

class PythonCoreApp:
    def __init__(self):
        self.app = Flask(__name__)
        self.analyzer = PythonCoreAnalyzer()
        self.user_code = ""
        self.user_globals = {}
        self.analysis_result = {}
        self.setup_routes()
    
    def setup_routes(self):
        """Setup Flask routes for the adaptive Python core app"""
        
        @self.app.route('/')
        def home():
            """Main page with framework info and analysis"""
            return jsonify({
                'framework': 'Python Core (Adaptive)',
                'version': '1.0.0',
                'description': 'Adaptive Python code execution with intelligent analysis',
                'analysis': self.analysis_result,
                'endpoints': self.get_available_endpoints(),
                'features': [
                    'Automatic code structure detection',
                    'Smart class and function analysis', 
                    'Dynamic API generation',
                    'Code complexity analysis',
                    'Pattern recognition',
                    'Interactive code execution'
                ]
            })
        
        @self.app.route('/health')
        def health():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'framework': 'python-core',
                'adaptive': True
            })
        
        @self.app.route('/api/docs')
        def api_docs():
            """Auto-generated API documentation"""
            return jsonify({
                'title': 'Python Core Adaptive API',
                'description': 'Auto-generated endpoints based on your Python code',
                'analysis': self.analysis_result,
                'endpoints': self.get_available_endpoints(),
                'code_statistics': self.get_code_statistics()
            })
        
        @self.app.route('/api/analysis')
        def get_analysis():
            """Get detailed code analysis"""
            return jsonify(self.analysis_result)
        
        @self.app.route('/api/reload', methods=['POST'])
        def reload_code():
            """Reload and re-analyze user code"""
            try:
                self.load_user_code()
                return jsonify({
                    'success': True,
                    'message': 'Code reloaded and analyzed successfully',
                    'analysis': self.analysis_result
                })
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': str(e)
                }), 500
        
        @self.app.route('/api/execute', methods=['POST'])
        def execute_code():
            """Execute arbitrary Python code"""
            try:
                code = request.json.get('code', '') if request.is_json else request.form.get('code', '')
                
                if not code:
                    return jsonify({'error': 'No code provided'}), 400
                
                # Execute code in user context
                result = self.execute_user_code(code)
                
                return jsonify({
                    'success': True,
                    'result': result,
                    'message': 'Code executed successfully'
                })
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': str(e),
                    'traceback': traceback.format_exc()
                }), 500
        
        @self.app.route('/api/classes')
        def get_classes():
            """Get all detected classes"""
            classes = self.analysis_result.get('classes', [])
            return jsonify({
                'classes': classes,
                'count': len(classes)
            })
        
        @self.app.route('/api/functions')
        def get_functions():
            """Get all detected functions"""
            functions = self.analysis_result.get('functions', [])
            return jsonify({
                'functions': functions,
                'count': len(functions)
            })
        
        # Dynamic class endpoints
        @self.app.route('/api/class/<class_name>')
        def get_class_info(class_name):
            """Get information about a specific class"""
            classes = self.analysis_result.get('classes', [])
            class_info = next((c for c in classes if c['name'].lower() == class_name.lower()), None)
            
            if not class_info:
                return jsonify({'error': f'Class {class_name} not found'}), 404
            
            return jsonify(class_info)
        
        @self.app.route('/api/class/<class_name>/instance', methods=['POST'])
        def create_class_instance(class_name):
            """Create an instance of a class"""
            try:
                classes = self.analysis_result.get('classes', [])
                class_info = next((c for c in classes if c['name'].lower() == class_name.lower()), None)
                
                if not class_info:
                    return jsonify({'error': f'Class {class_name} not found'}), 404
                
                # Get class from user globals
                cls = self.user_globals.get(class_info['name'])
                if not cls:
                    return jsonify({'error': f'Class {class_name} not available in runtime'}), 404
                
                # Get constructor arguments from request
                args = request.json.get('args', []) if request.is_json else []
                kwargs = request.json.get('kwargs', {}) if request.is_json else {}
                
                # Create instance
                instance = cls(*args, **kwargs)
                
                return jsonify({
                    'success': True,
                    'message': f'Instance of {class_name} created successfully',
                    'class_name': class_info['name'],
                    'instance_id': id(instance)
                })
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': str(e),
                    'traceback': traceback.format_exc()
                }), 500
        
        # Dynamic function endpoints
        @self.app.route('/api/function/<function_name>')
        def get_function_info(function_name):
            """Get information about a specific function"""
            functions = self.analysis_result.get('functions', [])
            func_info = next((f for f in functions if f['name'].lower() == function_name.lower()), None)
            
            if not func_info:
                return jsonify({'error': f'Function {function_name} not found'}), 404
            
            return jsonify(func_info)
        
        @self.app.route('/api/function/<function_name>/execute', methods=['POST'])
        def execute_function(function_name):
            """Execute a specific function"""
            try:
                functions = self.analysis_result.get('functions', [])
                func_info = next((f for f in functions if f['name'].lower() == function_name.lower()), None)
                
                if not func_info:
                    return jsonify({'error': f'Function {function_name} not found'}), 404
                
                # Get function from user globals
                func = self.user_globals.get(func_info['name'])
                if not func:
                    return jsonify({'error': f'Function {function_name} not available in runtime'}), 404
                
                # Get function arguments from request
                args = request.json.get('args', []) if request.is_json else []
                kwargs = request.json.get('kwargs', {}) if request.is_json else {}
                
                # Execute function
                result = func(*args, **kwargs)
                
                return jsonify({
                    'success': True,
                    'result': result,
                    'function_name': func_info['name'],
                    'args_used': args,
                    'kwargs_used': kwargs
                })
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': str(e),
                    'traceback': traceback.format_exc()
                }), 500
    
    def load_user_code(self):
        """Load and analyze user code from app.py"""
        try:
            user_code_file = '/app/app.py'
            if os.path.exists(user_code_file):
                with open(user_code_file, 'r') as f:
                    self.user_code = f.read()
            else:
                self.user_code = "# No user code found\nprint('Hello from Python Core!')"
            
            # Analyze the code
            self.analysis_result = self.analyzer.analyze_code(self.user_code)
            
            # Execute the code to make classes/functions available
            self.user_globals = {}
            exec(self.user_code, self.user_globals)
            
            print(f"📊 Analysis complete: {len(self.analysis_result.get('classes', []))} classes, {len(self.analysis_result.get('functions', []))} functions")
            
        except Exception as e:
            print(f"❌ Error loading user code: {e}")
            self.analysis_result = {'error': str(e)}
            self.user_globals = {}
    
    def execute_user_code(self, code):
        """Execute arbitrary code in the user context"""
        try:
            # Create a local context that includes user globals
            local_context = self.user_globals.copy()
            
            # Capture output
            import io
            import contextlib
            
            output_buffer = io.StringIO()
            
            with contextlib.redirect_stdout(output_buffer):
                result = eval(code, self.user_globals, local_context)
            
            output = output_buffer.getvalue()
            
            return {
                'result': result,
                'output': output,
                'type': type(result).__name__ if result is not None else 'None'
            }
        except Exception as e:
            # If eval fails, try exec
            try:
                import io
                import contextlib
                
                output_buffer = io.StringIO()
                
                with contextlib.redirect_stdout(output_buffer):
                    exec(code, self.user_globals, local_context)
                
                output = output_buffer.getvalue()
                
                return {
                    'result': None,
                    'output': output,
                    'type': 'execution'
                }
            except Exception as exec_error:
                raise exec_error
    
    def get_available_endpoints(self):
        """Get list of all available endpoints"""
        endpoints = [
            {'method': 'GET', 'path': '/', 'description': 'Framework info and analysis'},
            {'method': 'GET', 'path': '/health', 'description': 'Health check'},
            {'method': 'GET', 'path': '/api/docs', 'description': 'API documentation'},
            {'method': 'GET', 'path': '/api/analysis', 'description': 'Detailed code analysis'},
            {'method': 'POST', 'path': '/api/reload', 'description': 'Reload user code'},
            {'method': 'POST', 'path': '/api/execute', 'description': 'Execute arbitrary code'},
            {'method': 'GET', 'path': '/api/classes', 'description': 'Get all classes'},
            {'method': 'GET', 'path': '/api/functions', 'description': 'Get all functions'}
        ]
        
        # Add dynamic endpoints based on analysis
        for class_info in self.analysis_result.get('classes', []):
            class_name = class_info['name'].lower()
            endpoints.extend([
                {'method': 'GET', 'path': f'/api/class/{class_name}', 'description': f'Get {class_info["name"]} class info'},
                {'method': 'POST', 'path': f'/api/class/{class_name}/instance', 'description': f'Create {class_info["name"]} instance'}
            ])
        
        for func_info in self.analysis_result.get('functions', []):
            func_name = func_info['name'].lower()
            endpoints.extend([
                {'method': 'GET', 'path': f'/api/function/{func_name}', 'description': f'Get {func_info["name"]} function info'},
                {'method': 'POST', 'path': f'/api/function/{func_name}/execute', 'description': f'Execute {func_info["name"]} function'}
            ])
        
        return endpoints
    
    def get_code_statistics(self):
        """Get statistics about the analyzed code"""
        return {
            'total_classes': len(self.analysis_result.get('classes', [])),
            'total_functions': len(self.analysis_result.get('functions', [])),
            'total_imports': len(self.analysis_result.get('imports', [])),
            'total_variables': len(self.analysis_result.get('variables', [])),
            'complexity_score': self.analysis_result.get('complexity_score', 0),
            'code_style': self.analysis_result.get('code_style', 'unknown'),
            'detected_patterns': self.analysis_result.get('detected_patterns', [])
        }
    
    def run(self):
        """Run the Flask application"""
        # Load user code on startup
        self.load_user_code()
        
        print("🚀 Python Core Adaptive App starting...")
        print(f"📊 Detected: {len(self.analysis_result.get('classes', []))} classes, {len(self.analysis_result.get('functions', []))} functions")
        print("🌐 Available at: http://localhost:8003")
        
        self.app.run(host='0.0.0.0', port=8003, debug=True)

if __name__ == '__main__':
    app = PythonCoreApp()
    app.run() 