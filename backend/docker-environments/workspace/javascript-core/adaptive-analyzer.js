class JavaScriptCoreAnalyzer {
    constructor() {
        this.analysisResult = {
            classes: [],
            functions: [],
            variables: [],
            imports: [],
            exports: [],
            complexity_score: 0,
            code_style: 'unknown',
            detected_patterns: [],
            suggested_endpoints: []
        };
    }

    analyzeCode(code) {
        try {
            // Reset analysis
            this.analysisResult = {
                classes: [],
                functions: [],
                variables: [],
                imports: [],
                exports: [],
                complexity_score: 0,
                code_style: 'procedural',
                detected_patterns: [],
                suggested_endpoints: []
            };

            // Analyze different code patterns
            this.analyzeClasses(code);
            this.analyzeFunctions(code);
            this.analyzeVariables(code);
            this.analyzeImportsExports(code);
            this.detectPatterns(code);
            this.calculateComplexity();
            this.generateEndpoints();

            return this.analysisResult;
        } catch (error) {
            return {
                error: `Analysis Error: ${error.message}`,
                classes: [],
                functions: [],
                variables: [],
                imports: [],
                exports: []
            };
        }
    }

    analyzeClasses(code) {
        // ES6 Classes
        const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{([^{}]*(?:{[^{}]*}[^{}]*)*)}/g;
        let match;
        
        while ((match = classRegex.exec(code)) !== null) {
            const className = match[1];
            const parentClass = match[2] || null;
            const classBody = match[3];
            
            const classInfo = {
                name: className,
                parent_class: parentClass,
                methods: [],
                properties: [],
                is_es6_class: true,
                category: this.categorizeClass(className, classBody)
            };

            // Extract methods
            const methodRegex = /(?:static\s+)?(\w+)\s*\([^)]*\)\s*{/g;
            let methodMatch;
            while ((methodMatch = methodRegex.exec(classBody)) !== null) {
                const methodName = methodMatch[1];
                if (methodName !== 'constructor') {
                    classInfo.methods.push({
                        name: methodName,
                        is_static: methodMatch[0].includes('static'),
                        category: this.categorizeMethod(methodName)
                    });
                }
            }

            // Extract constructor parameters
            const constructorRegex = /constructor\s*\(([^)]*)\)/;
            const constructorMatch = constructorRegex.exec(classBody);
            if (constructorMatch) {
                classInfo.constructor_params = constructorMatch[1].split(',').map(p => p.trim()).filter(p => p);
            }

            this.analysisResult.classes.push(classInfo);
        }

        // Function constructors (older style)
        const functionConstructorRegex = /function\s+(\w+)\s*\([^)]*\)\s*{[\s\S]*?this\./g;
        while ((match = functionConstructorRegex.exec(code)) !== null) {
            const className = match[1];
            if (!this.analysisResult.classes.find(c => c.name === className)) {
                this.analysisResult.classes.push({
                    name: className,
                    methods: [],
                    properties: [],
                    is_es6_class: false,
                    category: 'constructor_function'
                });
            }
        }
    }

    analyzeFunctions(code) {
        // Regular functions
        const functionRegex = /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*{/g;
        let match;
        
        while ((match = functionRegex.exec(code)) !== null) {
            const functionName = match[1];
            const params = match[2].split(',').map(p => p.trim()).filter(p => p);
            
            // Skip if this is part of a class (constructor)
            const isConstructor = this.analysisResult.classes.some(c => c.name === functionName);
            if (!isConstructor) {
                this.analysisResult.functions.push({
                    name: functionName,
                    params: params,
                    param_count: params.length,
                    is_async: match[0].includes('async'),
                    category: this.categorizeFunction(functionName),
                    complexity: this.calculateFunctionComplexity(code, functionName)
                });
            }
        }

        // Arrow functions
        const arrowFunctionRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
        while ((match = arrowFunctionRegex.exec(code)) !== null) {
            const functionName = match[1];
            this.analysisResult.functions.push({
                name: functionName,
                params: [],
                is_arrow: true,
                is_async: match[0].includes('async'),
                category: this.categorizeFunction(functionName)
            });
        }
    }

    analyzeVariables(code) {
        // Variable declarations
        const varRegex = /(const|let|var)\s+(\w+)\s*=\s*([^;,\n]+)/g;
        let match;
        
        while ((match = varRegex.exec(code)) !== null) {
            const varType = match[1];
            const varName = match[2];
            const varValue = match[3].trim();
            
            this.analysisResult.variables.push({
                name: varName,
                type: varType,
                inferred_type: this.inferType(varValue),
                is_constant: varType === 'const'
            });
        }
    }

    analyzeImportsExports(code) {
        // ES6 imports
        const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        
        while ((match = importRegex.exec(code)) !== null) {
            const namedImports = match[1] ? match[1].split(',').map(i => i.trim()) : [];
            const defaultImport = match[2];
            const module = match[3];
            
            this.analysisResult.imports.push({
                module: module,
                default_import: defaultImport,
                named_imports: namedImports,
                is_builtin: this.isBuiltinModule(module)
            });
        }

        // CommonJS require
        const requireRegex = /(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=\s*require\(['"]([^'"]+)['"]\)/g;
        while ((match = requireRegex.exec(code)) !== null) {
            const destructured = match[1] ? match[1].split(',').map(i => i.trim()) : [];
            const variable = match[2];
            const module = match[3];
            
            this.analysisResult.imports.push({
                module: module,
                variable: variable,
                destructured: destructured,
                type: 'commonjs',
                is_builtin: this.isBuiltinModule(module)
            });
        }

        // Exports
        const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)?\s*(\w+)/g;
        while ((match = exportRegex.exec(code)) !== null) {
            this.analysisResult.exports.push({
                name: match[1],
                is_default: match[0].includes('default')
            });
        }
    }

    categorizeClass(className, classBody) {
        const name = className.toLowerCase();
        
        // Data models
        if (name.includes('model') || name.includes('entity') || name.includes('data')) {
            return 'data_model';
        }
        
        // Services/Managers
        if (name.includes('service') || name.includes('manager') || name.includes('handler')) {
            return 'service';
        }
        
        // Utilities
        if (name.includes('util') || name.includes('helper') || name.includes('tool')) {
            return 'utility';
        }
        
        // APIs/Controllers
        if (name.includes('api') || name.includes('controller') || name.includes('client')) {
            return 'api';
        }
        
        // Has CRUD-like methods
        const crudMethods = ['create', 'read', 'update', 'delete', 'save', 'find', 'get', 'set'];
        const hasCrud = crudMethods.some(method => classBody.toLowerCase().includes(method));
        if (hasCrud) {
            return 'data_manager';
        }
        
        return 'general';
    }

    categorizeMethod(methodName) {
        const name = methodName.toLowerCase();
        
        if (name.includes('get') || name.includes('fetch') || name.includes('find')) {
            return 'getter';
        }
        if (name.includes('set') || name.includes('update') || name.includes('save')) {
            return 'setter';
        }
        if (name.includes('create') || name.includes('add') || name.includes('insert')) {
            return 'creator';
        }
        if (name.includes('delete') || name.includes('remove') || name.includes('destroy')) {
            return 'destroyer';
        }
        if (name.includes('validate') || name.includes('check') || name.includes('verify')) {
            return 'validator';
        }
        
        return 'general';
    }

    categorizeFunction(functionName) {
        const name = functionName.toLowerCase();
        
        // I/O operations
        if (name.includes('read') || name.includes('write') || name.includes('load') || name.includes('save')) {
            return 'io_operation';
        }
        
        // Data processing
        if (name.includes('process') || name.includes('transform') || name.includes('convert') || name.includes('parse')) {
            return 'data_processing';
        }
        
        // Calculations
        if (name.includes('calculate') || name.includes('compute') || name.includes('sum') || name.includes('count')) {
            return 'calculation';
        }
        
        // Utilities
        if (name.includes('validate') || name.includes('check') || name.includes('verify') || name.includes('format')) {
            return 'utility';
        }
        
        // API functions
        if (name.includes('get') || name.includes('post') || name.includes('put') || name.includes('delete')) {
            return 'api_function';
        }
        
        return 'general';
    }

    detectPatterns(code) {
        const patterns = [];
        
        // Object-oriented vs functional
        if (this.analysisResult.classes.length > 0) {
            patterns.push('object_oriented');
            this.analysisResult.code_style = 'object_oriented';
        } else if (this.analysisResult.functions.length > 0) {
            patterns.push('functional');
            this.analysisResult.code_style = 'functional';
        }
        
        // Async patterns
        if (this.analysisResult.functions.some(f => f.is_async)) {
            patterns.push('asynchronous');
        }
        
        // ES6 features
        if (code.includes('=>') || code.includes('const ') || code.includes('let ')) {
            patterns.push('es6_features');
        }
        
        // Module patterns
        if (code.includes('import ') || code.includes('export ')) {
            patterns.push('es6_modules');
        } else if (code.includes('require(') || code.includes('module.exports')) {
            patterns.push('commonjs_modules');
        }
        
        // Promise patterns
        if (code.includes('.then(') || code.includes('.catch(') || code.includes('Promise')) {
            patterns.push('promises');
        }
        
        // DOM manipulation
        if (code.includes('document.') || code.includes('window.') || code.includes('getElementById')) {
            patterns.push('dom_manipulation');
        }
        
        this.analysisResult.detected_patterns = patterns;
    }

    generateEndpoints() {
        const endpoints = [];
        
        // Class-based endpoints
        for (const classInfo of this.analysisResult.classes) {
            const className = classInfo.name.toLowerCase();
            
            if (classInfo.category === 'data_model' || classInfo.category === 'data_manager') {
                endpoints.push(
                    {
                        method: 'GET',
                        path: `/api/${className}`,
                        description: `Get all ${classInfo.name} instances`,
                        handler: `${classInfo.name}.getAll()`
                    },
                    {
                        method: 'POST',
                        path: `/api/${className}`,
                        description: `Create new ${classInfo.name}`,
                        handler: `new ${classInfo.name}()`
                    }
                );
            }
        }
        
        // Function-based endpoints
        for (const funcInfo of this.analysisResult.functions) {
            if (funcInfo.category === 'api_function') {
                const method = funcInfo.name.toLowerCase().startsWith('get') ? 'GET' : 'POST';
                endpoints.push({
                    method: method,
                    path: `/api/${funcInfo.name.toLowerCase()}`,
                    description: `Execute ${funcInfo.name} function`,
                    handler: `${funcInfo.name}()`
                });
            } else if (funcInfo.category === 'calculation' || funcInfo.category === 'data_processing') {
                endpoints.push({
                    method: 'POST',
                    path: `/api/execute/${funcInfo.name.toLowerCase()}`,
                    description: `Execute ${funcInfo.name} with parameters`,
                    handler: `${funcInfo.name}()`
                });
            }
        }
        
        this.analysisResult.suggested_endpoints = endpoints;
    }

    calculateComplexity() {
        let score = 0;
        score += this.analysisResult.classes.length * 10;
        score += this.analysisResult.functions.length * 5;
        score += this.analysisResult.imports.length * 2;
        score += this.analysisResult.functions.reduce((sum, f) => sum + (f.complexity || 0), 0);
        
        this.analysisResult.complexity_score = score;
    }

    calculateFunctionComplexity(code, functionName) {
        // Simple complexity calculation based on control structures
        const functionRegex = new RegExp(`function\\s+${functionName}[^{]*{([^{}]*(?:{[^{}]*}[^{}]*)*)}`);
        const match = functionRegex.exec(code);
        
        if (!match) return 1;
        
        const functionBody = match[1];
        let complexity = 1; // Base complexity
        
        // Count decision points
        complexity += (functionBody.match(/if\s*\(/g) || []).length;
        complexity += (functionBody.match(/else/g) || []).length;
        complexity += (functionBody.match(/for\s*\(/g) || []).length;
        complexity += (functionBody.match(/while\s*\(/g) || []).length;
        complexity += (functionBody.match(/switch\s*\(/g) || []).length;
        complexity += (functionBody.match(/case\s+/g) || []).length;
        complexity += (functionBody.match(/catch\s*\(/g) || []).length;
        complexity += (functionBody.match(/&&|\|\|/g) || []).length;
        
        return complexity;
    }

    inferType(value) {
        value = value.trim();
        
        if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) {
            return 'string';
        }
        if (value === 'true' || value === 'false') {
            return 'boolean';
        }
        if (/^\d+$/.test(value)) {
            return 'number';
        }
        if (value.startsWith('[') && value.endsWith(']')) {
            return 'array';
        }
        if (value.startsWith('{') && value.endsWith('}')) {
            return 'object';
        }
        if (value.includes('function') || value.includes('=>')) {
            return 'function';
        }
        if (value === 'null') {
            return 'null';
        }
        if (value === 'undefined') {
            return 'undefined';
        }
        
        return 'unknown';
    }

    isBuiltinModule(moduleName) {
        const builtinModules = [
            'fs', 'path', 'http', 'https', 'url', 'querystring', 'crypto',
            'util', 'events', 'stream', 'buffer', 'os', 'child_process'
        ];
        return builtinModules.includes(moduleName);
    }
}

module.exports = JavaScriptCoreAnalyzer;

// Test the analyzer if run directly
if (require.main === module) {
    const analyzer = new JavaScriptCoreAnalyzer();
    
    const sampleCode = `
import fs from 'fs';
import { promisify } from 'util';

class Calculator {
    constructor() {
        this.history = [];
    }
    
    add(a, b) {
        const result = a + b;
        this.history.push(\`\${a} + \${b} = \${result}\`);
        return result;
    }
    
    getHistory() {
        return this.history;
    }
}

async function processData(data) {
    const result = await fetch('/api/data', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return result.json();
}

const factorial = (n) => {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
};

export default Calculator;
export { processData, factorial };
`;
    
    const result = analyzer.analyzeCode(sampleCode);
    console.log(JSON.stringify(result, null, 2));
} 
 