/**
 * Adaptive Express.js Code Analyzer
 * Automatically detects and adapts to any user Express.js implementation
 */

const fs = require('fs');
const path = require('path');

class ExpressCodeAnalyzer {
    constructor() {
        this.detectedModels = [];
        this.detectedRoutes = [];
        this.detectedMiddleware = [];
        this.codeStructure = null;
    }

    analyzeUserCode(code) {
        console.log('🔍 Analyzing user Express.js code...');
        
        const analysis = {
            framework: 'Express.js',
            models: this.extractModels(code),
            routes: this.extractRoutes(code),
            middleware: this.extractMiddleware(code),
            endpoints: this.extractEndpoints(code),
            structure: this.analyzeCodeStructure(code),
            adaptations: []
        };

        // Generate adaptive features based on analysis
        analysis.adaptations = this.generateAdaptations(analysis);
        
        console.log(`✅ Express analysis complete: ${analysis.models.length} models, ${analysis.routes.length} routes`);
        return analysis;
    }

    extractModels(code) {
        const models = [];
        const patterns = [
            // Class-based models
            /class\s+(\w+)\s*{([^}]*)}/g,
            // Object-based models  
            /const\s+(\w+)\s*=\s*{([^}]*)}/g,
            // Schema definitions
            /(\w+)Schema\s*=\s*{([^}]*)}/g,
            // Mongoose schemas
            /mongoose\.Schema\s*\(\s*{([^}]*)}/g
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const modelName = match[1];
                const modelBody = match[2] || match[1];
                
                if (this.isLikelyModel(modelName, modelBody)) {
                    models.push({
                        name: modelName,
                        type: this.detectModelType(modelBody),
                        fields: this.extractModelFields(modelBody),
                        methods: this.extractModelMethods(modelBody)
                    });
                }
            }
        });

        return models;
    }

    extractRoutes(code) {
        const routes = [];
        const routePatterns = [
            // app.get/post/put/delete
            /app\.(get|post|put|delete|patch)\s*\(\s*['"](.*?)['"],\s*(.*?)\)/g,
            // router.get/post/put/delete
            /router\.(get|post|put|delete|patch)\s*\(\s*['"](.*?)['"],\s*(.*?)\)/g,
            // express.Router()
            /express\.Router\(\)/g
        ];

        routePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                if (match[1] && match[2]) {
                    routes.push({
                        method: match[1].toUpperCase(),
                        path: match[2],
                        handler: match[3] || 'handler'
                    });
                }
            }
        });

        return routes;
    }

    extractMiddleware(code) {
        const middleware = [];
        const middlewarePatterns = [
            /app\.use\s*\(\s*(.*?)\)/g,
            /router\.use\s*\(\s*(.*?)\)/g,
            /\.use\s*\(\s*['"](.*?)['"],\s*(.*?)\)/g
        ];

        middlewarePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                middleware.push({
                    type: 'middleware',
                    definition: match[1],
                    scope: match[2] ? 'route-specific' : 'global'
                });
            }
        });

        return middleware;
    }

    extractEndpoints(code) {
        const endpoints = [];
        
        // Extract all potential API endpoints
        const endpointPattern = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"](.*?)['"],.*?\)/g;
        let match;
        
        while ((match = endpointPattern.exec(code)) !== null) {
            endpoints.push({
                method: match[1].toUpperCase(),
                path: match[2],
                fullPath: `/api${match[2].startsWith('/') ? '' : '/'}${match[2]}`
            });
        }

        return endpoints;
    }

    analyzeCodeStructure(code) {
        return {
            hasExpress: /require\s*\(\s*['"']express['"']\s*\)/.test(code),
            hasRouter: /express\.Router\(\)/.test(code),
            hasMiddleware: /\.use\s*\(/.test(code),
            hasModels: /class\s+\w+|const\s+\w+\s*=\s*{/.test(code),
            hasDatabase: /mongoose|sequelize|knex|prisma/.test(code),
            moduleType: this.detectModuleType(code),
            complexity: this.calculateComplexity(code)
        };
    }

    isLikelyModel(name, body) {
        const modelIndicators = [
            /name|title|id|created|updated/i,
            /string|number|date|boolean/i,
            /varchar|int|text|datetime/i,
            /Schema|Model/i
        ];

        return modelIndicators.some(pattern => 
            pattern.test(name) || pattern.test(body)
        );
    }

    detectModelType(body) {
        if (/mongoose|Schema/.test(body)) return 'mongoose';
        if (/sequelize|DataTypes/.test(body)) return 'sequelize';
        if (/class\s+/.test(body)) return 'class';
        if (/{.*}/.test(body)) return 'object';
        return 'unknown';
    }

    extractModelFields(body) {
        const fields = [];
        const fieldPatterns = [
            // Object notation: field: type
            /(\w+)\s*:\s*(\w+)/g,
            // Class properties: this.field = value
            /this\.(\w+)\s*=\s*(.+)/g,
            // Mongoose style: field: { type: String }
            /(\w+)\s*:\s*{\s*type\s*:\s*(\w+)/g
        ];

        fieldPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(body)) !== null) {
                fields.push({
                    name: match[1],
                    type: match[2],
                    category: this.categorizeField(match[1])
                });
            }
        });

        return fields;
    }

    extractModelMethods(body) {
        const methods = [];
        const methodPattern = /(\w+)\s*\([^)]*\)\s*{/g;
        let match;

        while ((match = methodPattern.exec(body)) !== null) {
            methods.push({
                name: match[1],
                type: this.categorizeMethod(match[1])
            });
        }

        return methods;
    }

    categorizeField(fieldName) {
        const fieldName_lower = fieldName.toLowerCase();
        
        if (['id', '_id', 'uuid'].includes(fieldName_lower)) return 'identifier';
        if (['name', 'title', 'subject', 'headline'].includes(fieldName_lower)) return 'display';
        if (['content', 'body', 'description', 'text'].includes(fieldName_lower)) return 'content';
        if (['author', 'user', 'creator', 'owner'].includes(fieldName_lower)) return 'author';
        if (['created', 'updated', 'date', 'time'].some(t => fieldName_lower.includes(t))) return 'timestamp';
        if (['email', 'phone', 'address'].includes(fieldName_lower)) return 'contact';
        if (['price', 'cost', 'amount', 'value'].includes(fieldName_lower)) return 'numeric';
        
        return 'general';
    }

    categorizeMethod(methodName) {
        const methodName_lower = methodName.toLowerCase();
        
        if (['get', 'find', 'search', 'list'].some(t => methodName_lower.includes(t))) return 'read';
        if (['post', 'create', 'add', 'insert'].some(t => methodName_lower.includes(t))) return 'create';
        if (['put', 'patch', 'update', 'edit'].some(t => methodName_lower.includes(t))) return 'update';
        if (['delete', 'remove', 'destroy'].some(t => methodName_lower.includes(t))) return 'delete';
        
        return 'utility';
    }

    detectModuleType(code) {
        if (/module\.exports|exports\./.test(code)) return 'commonjs';
        if (/export\s+default|export\s+{/.test(code)) return 'es6';
        return 'unknown';
    }

    calculateComplexity(code) {
        const lines = code.split('\n').length;
        const functions = (code.match(/function\s+\w+|=>\s*{|\w+\s*\(/g) || []).length;
        const routes = (code.match(/\.(get|post|put|delete|patch)\s*\(/g) || []).length;
        
        return {
            lines,
            functions,
            routes,
            score: Math.min(10, Math.floor((lines + functions * 2 + routes * 3) / 10))
        };
    }

    generateAdaptations(analysis) {
        const adaptations = [];

        // Add missing CRUD operations
        if (analysis.models.length > 0 && analysis.routes.length === 0) {
            adaptations.push({
                type: 'generate_crud_routes',
                description: 'Generate CRUD routes for detected models',
                models: analysis.models.map(m => m.name)
            });
        }

        // Add API documentation endpoint
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

        // Add CORS if needed
        if (!analysis.structure.hasMiddleware) {
            adaptations.push({
                type: 'add_cors',
                description: 'Add CORS middleware for API access'
            });
        }

        return adaptations;
    }
}

module.exports = ExpressCodeAnalyzer; 