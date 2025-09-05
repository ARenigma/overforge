/**
 * Adaptive Node.js Code Analyzer
 * Automatically detects and adapts to any user Node.js implementation
 */

const fs = require('fs');
const path = require('path');

class NodeJSCodeAnalyzer {
    constructor() {
        this.detectedModules = [];
        this.detectedFunctions = [];
        this.detectedClasses = [];
        this.detectedAPIs = [];
        this.codeStructure = null;
    }

    analyzeUserCode(code) {
        console.log('🔍 Analyzing user Node.js code...');
        
        const analysis = {
            framework: 'Node.js',
            modules: this.extractModules(code),
            functions: this.extractFunctions(code),
            classes: this.extractClasses(code),
            apis: this.extractAPIs(code),
            structure: this.analyzeCodeStructure(code),
            adaptations: []
        };

        // Generate adaptive features based on analysis
        analysis.adaptations = this.generateAdaptations(analysis);
        
        console.log(`✅ Node.js analysis complete: ${analysis.classes.length} classes, ${analysis.functions.length} functions`);
        return analysis;
    }

    extractModules(code) {
        const modules = [];
        const patterns = [
            // require statements
            /require\s*\(\s*['"](.*?)['"][^)]*\)/g,
            // import statements  
            /import\s+.*?\s+from\s+['"](.*?)['"];?/g,
            // module.exports
            /module\.exports\s*=\s*(.*)/g
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                modules.push({
                    name: match[1],
                    type: this.determineModuleType(match[1]),
                    usage: match[0]
                });
            }
        });

        return this.deduplicateModules(modules);
    }

    extractFunctions(code) {
        const functions = [];
        const patterns = [
            // Function declarations
            /function\s+(\w+)\s*\([^)]*\)\s*{/g,
            // Arrow functions assigned to variables
            /(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
            // Method definitions in objects
            /(\w+)\s*:\s*function\s*\([^)]*\)/g,
            // Async functions
            /async\s+function\s+(\w+)\s*\([^)]*\)/g
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const functionName = match[1];
                if (functionName && !this.isBuiltinFunction(functionName)) {
                    functions.push({
                        name: functionName,
                        type: this.categorizeFunctionType(functionName, match[0]),
                        isAsync: match[0].includes('async'),
                        definition: match[0]
                    });
                }
            }
        });

        return functions;
    }

    extractClasses(code) {
        const classes = [];
        const patterns = [
            // ES6 class declarations
            /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{([^}]*)}/g,
            // Constructor functions
            /function\s+(\w+)\s*\([^)]*\)\s*{[^}]*this\./g
        ];

        patterns.forEach((pattern, index) => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const className = match[1];
                const classBody = match[3] || match[0];
                
                if (this.isLikelyClass(className, classBody)) {
                    classes.push({
                        name: className,
                        type: index === 0 ? 'es6-class' : 'constructor-function',
                        extends: match[2] || null,
                        methods: this.extractClassMethods(classBody),
                        properties: this.extractClassProperties(classBody)
                    });
                }
            }
        });

        return classes;
    }

    extractAPIs(code) {
        const apis = [];
        const patterns = [
            // HTTP server endpoints
            /\.(?:get|post|put|delete|patch)\s*\(\s*['"](.*?)['"],\s*(.*?)\)/g,
            // Express-style routing
            /app\.(?:get|post|put|delete|patch)\s*\(\s*['"](.*?)['"],/g,
            // HTTP createServer
            /createServer\s*\(\s*(?:.*?)\s*\)/g
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                if (match[1]) {
                    apis.push({
                        path: match[1],
                        handler: match[2] || 'handler',
                        type: 'http-endpoint'
                    });
                }
            }
        });

        return apis;
    }

    analyzeCodeStructure(code) {
        return {
            hasHTTP: /http|express|server|app\.listen/.test(code),
            hasFileSystem: /fs\.|require.*fs/.test(code),
            hasDatabase: /mongoose|sequelize|mysql|postgres|mongodb/.test(code),
            hasAsync: /async|await|Promise|\.then/.test(code),
            hasES6: /import |export |class |const |let |=>/.test(code),
            hasCommonJS: /require\(|module\.exports|exports\./.test(code),
            moduleType: this.detectModuleType(code),
            complexity: this.calculateComplexity(code)
        };
    }

    isLikelyClass(name, body) {
        // Check if it's likely a class based on naming and content
        const hasCapitalizedName = /^[A-Z]/.test(name);
        const hasClassMethods = /constructor|this\.|prototype\./.test(body);
        const hasProperties = /this\.\w+\s*=/.test(body);
        
        return hasCapitalizedName && (hasClassMethods || hasProperties);
    }

    extractClassMethods(classBody) {
        const methods = [];
        const methodPattern = /(\w+)\s*\([^)]*\)\s*{/g;
        let match;

        while ((match = methodPattern.exec(classBody)) !== null) {
            if (match[1] !== 'constructor') {
                methods.push({
                    name: match[1],
                    type: this.categorizeMethod(match[1])
                });
            }
        }

        return methods;
    }

    extractClassProperties(classBody) {
        const properties = [];
        const propertyPattern = /this\.(\w+)\s*=/g;
        let match;

        while ((match = propertyPattern.exec(classBody)) !== null) {
            properties.push({
                name: match[1],
                category: this.categorizeProperty(match[1])
            });
        }

        return properties;
    }

    determineModuleType(moduleName) {
        const builtInModules = ['fs', 'path', 'http', 'https', 'url', 'crypto', 'util', 'events', 'stream'];
        const webFrameworks = ['express', 'koa', 'fastify', 'hapi'];
        const databases = ['mongoose', 'sequelize', 'mysql', 'pg', 'mongodb'];

        if (builtInModules.includes(moduleName)) return 'builtin';
        if (webFrameworks.includes(moduleName)) return 'web-framework';
        if (databases.includes(moduleName)) return 'database';
        if (moduleName.startsWith('./') || moduleName.startsWith('../')) return 'local';
        
        return 'npm-package';
    }

    isBuiltinFunction(functionName) {
        const builtins = ['console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];
        return builtins.includes(functionName);
    }

    categorizeFunctionType(functionName, definition) {
        const name = functionName.toLowerCase();
        
        if (name.includes('handler') || name.includes('callback')) return 'handler';
        if (name.includes('process') || name.includes('parse')) return 'processor';
        if (name.includes('validate') || name.includes('check')) return 'validator';
        if (name.includes('create') || name.includes('make')) return 'creator';
        if (name.includes('get') || name.includes('find')) return 'getter';
        if (name.includes('set') || name.includes('update')) return 'setter';
        if (definition.includes('async') || definition.includes('await')) return 'async';
        
        return 'utility';
    }

    categorizeMethod(methodName) {
        const name = methodName.toLowerCase();
        
        if (['get', 'find', 'search', 'list'].some(t => name.includes(t))) return 'read';
        if (['create', 'add', 'insert', 'post'].some(t => name.includes(t))) return 'create';
        if (['update', 'edit', 'modify', 'put', 'patch'].some(t => name.includes(t))) return 'update';
        if (['delete', 'remove', 'destroy'].some(t => name.includes(t))) return 'delete';
        if (['init', 'setup', 'configure'].some(t => name.includes(t))) return 'setup';
        
        return 'utility';
    }

    categorizeProperty(propertyName) {
        const name = propertyName.toLowerCase();
        
        if (['id', 'uuid', 'key'].includes(name)) return 'identifier';
        if (['name', 'title', 'label'].includes(name)) return 'display';
        if (['data', 'content', 'body', 'text'].includes(name)) return 'content';
        if (['config', 'options', 'settings'].includes(name)) return 'configuration';
        if (['status', 'state', 'mode'].includes(name)) return 'state';
        
        return 'general';
    }

    detectModuleType(code) {
        if (/import |export /.test(code)) return 'es6';
        if (/require\(|module\.exports/.test(code)) return 'commonjs';
        return 'unknown';
    }

    calculateComplexity(code) {
        const lines = code.split('\n').length;
        const functions = (code.match(/function\s+\w+|=>\s*{|\w+\s*\(/g) || []).length;
        const classes = (code.match(/class\s+\w+/g) || []).length;
        const callbacks = (code.match(/callback|\.then|\.catch|async|await/g) || []).length;
        
        return {
            lines,
            functions,
            classes,
            callbacks,
            score: Math.min(10, Math.floor((lines + functions * 2 + classes * 3 + callbacks) / 15))
        };
    }

    deduplicateModules(modules) {
        const seen = new Set();
        return modules.filter(module => {
            if (seen.has(module.name)) {
                return false;
            }
            seen.add(module.name);
            return true;
        });
    }

    generateAdaptations(analysis) {
        const adaptations = [];

        // Add HTTP server if none detected
        if (!analysis.structure.hasHTTP && analysis.functions.length > 0) {
            adaptations.push({
                type: 'add_http_server',
                description: 'Add HTTP server to expose functions as endpoints',
                functions: analysis.functions.map(f => f.name)
            });
        }

        // Add API documentation
        adaptations.push({
            type: 'add_api_docs',
            description: 'Add API documentation endpoint',
            path: '/api/docs'
        });

        // Add health check
        adaptations.push({
            type: 'add_health_check',
            description: 'Add health check endpoint',
            path: '/health'
        });

        // Add class visualization if classes exist
        if (analysis.classes.length > 0) {
            adaptations.push({
                type: 'add_class_visualization',
                description: 'Add endpoint to visualize class structure',
                classes: analysis.classes.map(c => c.name)
            });
        }

        // Suggest module organization if many modules
        if (analysis.modules.length > 5) {
            adaptations.push({
                type: 'suggest_module_organization',
                description: 'Suggest organizing modules into categories'
            });
        }

        return adaptations;
    }
}

module.exports = NodeJSCodeAnalyzer; 