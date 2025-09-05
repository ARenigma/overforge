import ast
import re
import json
import inspect
import types
from typing import Dict, List, Any

class PythonCoreAnalyzer:
    def __init__(self):
        self.analysis_result = {
            'classes': [],
            'functions': [],
            'imports': [],
            'variables': [],
            'complexity_score': 0,
            'code_style': 'unknown',
            'detected_patterns': [],
            'suggested_endpoints': []
        }
    
    def analyze_code(self, code: str) -> Dict[str, Any]:
        """Analyze Python code structure and patterns"""
        try:
            # Parse the code into AST
            tree = ast.parse(code)
            
            # Reset analysis
            self.analysis_result = {
                'classes': [],
                'functions': [],
                'imports': [],
                'variables': [],
                'complexity_score': 0,
                'code_style': 'procedural',
                'detected_patterns': [],
                'suggested_endpoints': []
            }
            
            # Analyze AST nodes
            for node in ast.walk(tree):
                self._analyze_node(node)
            
            # Detect coding patterns
            self._detect_patterns(code)
            
            # Calculate complexity
            self._calculate_complexity()
            
            # Generate suggested endpoints
            self._generate_endpoints()
            
            return self.analysis_result
            
        except SyntaxError as e:
            return {
                'error': f'Syntax Error: {str(e)}',
                'classes': [],
                'functions': [],
                'imports': [],
                'variables': []
            }
        except Exception as e:
            return {
                'error': f'Analysis Error: {str(e)}',
                'classes': [],
                'functions': [],
                'imports': [],
                'variables': []
            }
    
    def _analyze_node(self, node):
        """Analyze individual AST nodes"""
        if isinstance(node, ast.ClassDef):
            self._analyze_class(node)
        elif isinstance(node, ast.FunctionDef):
            self._analyze_function(node)
        elif isinstance(node, ast.Import) or isinstance(node, ast.ImportFrom):
            self._analyze_import(node)
        elif isinstance(node, ast.Assign):
            self._analyze_assignment(node)
    
    def _analyze_class(self, node):
        """Analyze class definitions"""
        class_info = {
            'name': node.name,
            'methods': [],
            'attributes': [],
            'base_classes': [base.id if hasattr(base, 'id') else str(base) for base in node.bases],
            'docstring': ast.get_docstring(node),
            'line_number': node.lineno
        }
        
        # Analyze methods and attributes
        for item in node.body:
            if isinstance(item, ast.FunctionDef):
                method_info = {
                    'name': item.name,
                    'args': [arg.arg for arg in item.args.args],
                    'is_property': any(isinstance(decorator, ast.Name) and decorator.id == 'property' 
                                     for decorator in item.decorator_list),
                    'is_static': any(isinstance(decorator, ast.Name) and decorator.id == 'staticmethod' 
                                   for decorator in item.decorator_list),
                    'is_class_method': any(isinstance(decorator, ast.Name) and decorator.id == 'classmethod' 
                                         for decorator in item.decorator_list),
                    'docstring': ast.get_docstring(item)
                }
                class_info['methods'].append(method_info)
            elif isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        class_info['attributes'].append(target.id)
        
        # Categorize class type
        class_info['category'] = self._categorize_class(class_info)
        self.analysis_result['classes'].append(class_info)
    
    def _analyze_function(self, node):
        """Analyze function definitions"""
        function_info = {
            'name': node.name,
            'args': [arg.arg for arg in node.args.args],
            'returns': self._extract_return_type(node),
            'is_async': isinstance(node, ast.AsyncFunctionDef),
            'decorators': [decorator.id if hasattr(decorator, 'id') else str(decorator) 
                         for decorator in node.decorator_list],
            'docstring': ast.get_docstring(node),
            'line_number': node.lineno,
            'complexity': self._calculate_function_complexity(node)
        }
        
        # Categorize function type
        function_info['category'] = self._categorize_function(function_info)
        self.analysis_result['functions'].append(function_info)
    
    def _analyze_import(self, node):
        """Analyze import statements"""
        if isinstance(node, ast.Import):
            for alias in node.names:
                self.analysis_result['imports'].append({
                    'module': alias.name,
                    'alias': alias.asname,
                    'type': 'import',
                    'is_builtin': self._is_builtin_module(alias.name)
                })
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ''
            for alias in node.names:
                self.analysis_result['imports'].append({
                    'module': module,
                    'name': alias.name,
                    'alias': alias.asname,
                    'type': 'from_import',
                    'is_builtin': self._is_builtin_module(module)
                })
    
    def _analyze_assignment(self, node):
        """Analyze variable assignments"""
        for target in node.targets:
            if isinstance(target, ast.Name):
                var_info = {
                    'name': target.id,
                    'type': self._infer_type(node.value),
                    'line_number': node.lineno
                }
                self.analysis_result['variables'].append(var_info)
    
    def _categorize_class(self, class_info):
        """Categorize class based on its characteristics"""
        name = class_info['name'].lower()
        methods = [m['name'] for m in class_info['methods']]
        
        # Data models
        if any(keyword in name for keyword in ['model', 'entity', 'data', 'record']):
            return 'data_model'
        
        # Services/Managers
        if any(keyword in name for keyword in ['service', 'manager', 'handler', 'processor']):
            return 'service'
        
        # Utilities
        if any(keyword in name for keyword in ['util', 'helper', 'tool']):
            return 'utility'
        
        # APIs/Controllers
        if any(keyword in name for keyword in ['api', 'controller', 'client']):
            return 'api'
        
        # Has CRUD-like methods
        crud_methods = ['create', 'read', 'update', 'delete', 'save', 'find', 'get', 'set']
        if len([m for m in methods if any(crud in m.lower() for crud in crud_methods)]) >= 2:
            return 'data_manager'
        
        return 'general'
    
    def _categorize_function(self, func_info):
        """Categorize function based on its characteristics"""
        name = func_info['name'].lower()
        
        # I/O operations
        if any(keyword in name for keyword in ['read', 'write', 'load', 'save', 'fetch', 'send']):
            return 'io_operation'
        
        # Data processing
        if any(keyword in name for keyword in ['process', 'transform', 'convert', 'parse', 'format']):
            return 'data_processing'
        
        # Calculations
        if any(keyword in name for keyword in ['calculate', 'compute', 'sum', 'count', 'average']):
            return 'calculation'
        
        # Utilities
        if any(keyword in name for keyword in ['validate', 'check', 'verify', 'clean', 'format']):
            return 'utility'
        
        # API/Web related
        if any(keyword in name for keyword in ['get', 'post', 'put', 'delete', 'api', 'request']):
            return 'api_function'
        
        return 'general'
    
    def _detect_patterns(self, code):
        """Detect coding patterns and frameworks"""
        patterns = []
        
        # Object-oriented vs functional
        if self.analysis_result['classes']:
            patterns.append('object_oriented')
            self.analysis_result['code_style'] = 'object_oriented'
        elif self.analysis_result['functions']:
            patterns.append('functional')
            self.analysis_result['code_style'] = 'functional'
        
        # Async patterns
        if any(f['is_async'] for f in self.analysis_result['functions']):
            patterns.append('asynchronous')
        
        # Data science patterns
        data_imports = ['pandas', 'numpy', 'matplotlib', 'seaborn', 'sklearn']
        if any(imp['module'].startswith(tuple(data_imports)) for imp in self.analysis_result['imports']):
            patterns.append('data_science')
        
        # Web patterns
        web_imports = ['flask', 'django', 'fastapi', 'requests', 'urllib']
        if any(imp['module'].startswith(tuple(web_imports)) for imp in self.analysis_result['imports']):
            patterns.append('web_development')
        
        # Testing patterns
        if any(imp['module'].startswith(('unittest', 'pytest', 'mock')) for imp in self.analysis_result['imports']):
            patterns.append('testing')
        
        self.analysis_result['detected_patterns'] = patterns
    
    def _generate_endpoints(self):
        """Generate suggested REST endpoints based on detected code"""
        endpoints = []
        
        # Class-based endpoints
        for class_info in self.analysis_result['classes']:
            class_name = class_info['name'].lower()
            
            if class_info['category'] in ['data_model', 'data_manager']:
                endpoints.extend([
                    {
                        'method': 'GET',
                        'path': f'/api/{class_name}',
                        'description': f'Get all {class_name} instances',
                        'handler': f'{class_info["name"]}.get_all()'
                    },
                    {
                        'method': 'POST',
                        'path': f'/api/{class_name}',
                        'description': f'Create new {class_name}',
                        'handler': f'{class_info["name"]}.create()'
                    },
                    {
                        'method': 'GET',
                        'path': f'/api/{class_name}/{{id}}',
                        'description': f'Get specific {class_name}',
                        'handler': f'{class_info["name"]}.get_by_id()'
                    }
                ])
        
        # Function-based endpoints
        for func_info in self.analysis_result['functions']:
            if func_info['category'] == 'api_function':
                method = 'GET' if func_info['name'].lower().startswith('get') else 'POST'
                endpoints.append({
                    'method': method,
                    'path': f'/api/{func_info["name"].lower()}',
                    'description': f'Execute {func_info["name"]} function',
                    'handler': f'{func_info["name"]}()'
                })
            elif func_info['category'] in ['calculation', 'data_processing']:
                endpoints.append({
                    'method': 'POST',
                    'path': f'/api/execute/{func_info["name"].lower()}',
                    'description': f'Execute {func_info["name"]} with parameters',
                    'handler': f'{func_info["name"]}()'
                })
        
        self.analysis_result['suggested_endpoints'] = endpoints
    
    def _calculate_complexity(self):
        """Calculate overall code complexity score"""
        score = 0
        score += len(self.analysis_result['classes']) * 10
        score += len(self.analysis_result['functions']) * 5
        score += len(self.analysis_result['imports']) * 2
        score += sum(f.get('complexity', 0) for f in self.analysis_result['functions'])
        
        self.analysis_result['complexity_score'] = score
    
    def _calculate_function_complexity(self, node):
        """Calculate cyclomatic complexity of a function"""
        complexity = 1  # Base complexity
        
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.Try, ast.With)):
                complexity += 1
            elif isinstance(child, ast.BoolOp):
                complexity += len(child.values) - 1
        
        return complexity
    
    def _extract_return_type(self, node):
        """Extract return type annotation if present"""
        if hasattr(node, 'returns') and node.returns:
            if hasattr(node.returns, 'id'):
                return node.returns.id
            else:
                return str(node.returns)
        return 'unknown'
    
    def _infer_type(self, node):
        """Infer variable type from AST node"""
        if isinstance(node, ast.Constant):
            return type(node.value).__name__
        elif isinstance(node, ast.List):
            return 'list'
        elif isinstance(node, ast.Dict):
            return 'dict'
        elif isinstance(node, ast.Set):
            return 'set'
        elif isinstance(node, ast.Tuple):
            return 'tuple'
        elif isinstance(node, ast.Call):
            if hasattr(node.func, 'id') and isinstance(node.func, ast.Name):
                return node.func.id + '()'
            return 'function_call'
        return 'unknown'
    
    def _is_builtin_module(self, module_name):
        """Check if module is a Python builtin"""
        builtin_modules = {
            'os', 'sys', 'json', 're', 'datetime', 'math', 'random', 
            'collections', 'itertools', 'functools', 'pathlib', 'typing'
        }
        return module_name.split('.')[0] in builtin_modules

if __name__ == "__main__":
    # Test the analyzer
    analyzer = PythonCoreAnalyzer()
    
    sample_code = """
class Calculator:
    def __init__(self):
        self.history = []
    
    def add(self, a, b):
        result = a + b
        self.history.append(f"{a} + {b} = {result}")
        return result
    
    def get_history(self):
        return self.history

def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

import math
import json
"""
    
    result = analyzer.analyze_code(sample_code)
    print(json.dumps(result, indent=2)) 