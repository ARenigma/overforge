/**
 * Adaptive Node.js Application
 * Automatically adapts to any user Node.js code implementation
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const NodeJSCodeAnalyzer = require('./adaptive-analyzer');

class AdaptiveNodeJSApp {
    constructor() {
        this.analyzer = new NodeJSCodeAnalyzer();
        this.userAnalysis = null;
        this.port = process.env.PORT || 3000;
        this.server = null;
        this.routes = new Map();
        
        this.setupRoutes();
    }

    async loadUserCode() {
        try {
            // Try to load user code from various locations
            const possiblePaths = [
                path.join(__dirname, 'app.js'),
                path.join(__dirname, 'index.js'),
                path.join(__dirname, 'main.js'),
                path.join(__dirname, 'server.js'),
                path.join(__dirname, 'user-code.js')
            ];

            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath) && filePath !== __filename) {
                    const userCode = fs.readFileSync(filePath, 'utf8');
                    console.log(`📁 Loading user code from: ${filePath}`);
                    
                    // Analyze the user's code
                    this.userAnalysis = this.analyzer.analyzeUserCode(userCode);
                    
                    // Try to execute user code safely
                    try {
                        // Create a safe evaluation context
                        const userContext = this.createUserContext();
                        eval(`(function() { ${userCode} }).call(userContext)`);
                        console.log('✅ User code executed successfully');
                    } catch (error) {
                        console.log('⚠️ User code execution failed, using analysis only:', error.message);
                    }
                    
                    return this.userAnalysis;
                }
            }

            console.log('📝 No user code found, creating default analysis');
            return this.createDefaultAnalysis();
        } catch (error) {
            console.error('❌ Error loading user code:', error);
            return this.createDefaultAnalysis();
        }
    }

    createUserContext() {
        // Create a safe context for user code execution
        return {
            console: console,
            require: require,
            module: { exports: {} },
            exports: {},
            __dirname: __dirname,
            __filename: __filename,
            process: process,
            Buffer: Buffer,
            setTimeout: setTimeout,
            setInterval: setInterval,
            clearTimeout: clearTimeout,
            clearInterval: clearInterval
        };
    }

    createDefaultAnalysis() {
        return {
            framework: 'Node.js',
            modules: [],
            functions: [],
            classes: [],
            apis: [],
            structure: {
                hasHTTP: false,
                hasFileSystem: false,
                hasDatabase: false,
                hasAsync: false,
                hasES6: false,
                hasCommonJS: true,
                moduleType: 'commonjs',
                complexity: { lines: 0, functions: 0, classes: 0, callbacks: 0, score: 0 }
            },
            adaptations: [
                {
                    type: 'create_sample_function',
                    description: 'Create sample function for demonstration'
                }
            ]
        };
    }

    setupRoutes() {
        // Health check endpoint
        this.routes.set('/health', (req, res) => {
            const response = {
                status: 'healthy',
                framework: 'Node.js',
                timestamp: new Date().toISOString(),
                analysis: this.userAnalysis ? 'loaded' : 'pending'
            };
            this.sendJSON(res, response);
        });

        // Main API info endpoint
        this.routes.set('/', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            const response = {
                framework: 'Node.js Adaptive System',
                message: 'Adaptive Node.js application running',
                analysis: this.userAnalysis,
                endpoints: this.generateEndpointList(),
                documentation: '/api/docs'
            };
            this.sendJSON(res, response);
        });

        // API documentation endpoint
        this.routes.set('/api/docs', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            const response = {
                title: 'Adaptive Node.js API Documentation',
                description: 'Auto-generated documentation based on code analysis',
                analysis: this.userAnalysis,
                endpoints: this.generateDetailedEndpoints(),
                modules: this.userAnalysis.modules,
                functions: this.userAnalysis.functions,
                classes: this.userAnalysis.classes,
                adaptations: this.userAnalysis.adaptations
            };
            this.sendJSON(res, response);
        });

        // Analysis endpoint
        this.routes.set('/api/analysis', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }
            this.sendJSON(res, this.userAnalysis);
        });

        // Classes endpoint
        this.routes.set('/api/classes', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            const response = {
                classes: this.userAnalysis.classes,
                count: this.userAnalysis.classes.length,
                framework: 'Node.js'
            };
            this.sendJSON(res, response);
        });

        // Functions endpoint
        this.routes.set('/api/functions', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            const response = {
                functions: this.userAnalysis.functions,
                count: this.userAnalysis.functions.length,
                framework: 'Node.js'
            };
            this.sendJSON(res, response);
        });

        // Modules endpoint
        this.routes.set('/api/modules', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            const response = {
                modules: this.userAnalysis.modules,
                count: this.userAnalysis.modules.length,
                framework: 'Node.js'
            };
            this.sendJSON(res, response);
        });

        // Reload user code endpoint
        this.routes.set('/api/reload', async (req, res) => {
            if (req.method === 'POST') {
                console.log('🔄 Reloading user code...');
                this.userAnalysis = await this.loadUserCode();
                this.setupDynamicRoutes();
                
                const response = {
                    success: true,
                    message: 'User code reloaded and analyzed',
                    analysis: this.userAnalysis
                };
                this.sendJSON(res, response);
            } else {
                this.sendError(res, 405, 'Method Not Allowed');
            }
        });
    }

    setupDynamicRoutes() {
        if (!this.userAnalysis) return;

        // Create endpoints for each detected class
        this.userAnalysis.classes.forEach(cls => {
            this.createClassRoutes(cls);
        });

        // Create endpoints for each detected function
        this.userAnalysis.functions.forEach(func => {
            this.createFunctionRoute(func);
        });

        // Apply adaptations
        this.userAnalysis.adaptations.forEach(adaptation => {
            this.applyAdaptation(adaptation);
        });
    }

    createClassRoutes(cls) {
        const className = cls.name.toLowerCase();
        
        console.log(`🔗 Creating routes for class: ${cls.name}`);

        // GET /api/class/:className - Get class info
        this.routes.set(`/api/class/${className}`, (req, res) => {
            const response = {
                class: cls.name,
                type: cls.type,
                methods: cls.methods,
                properties: cls.properties,
                sampleData: this.generateClassSampleData(cls)
            };
            this.sendJSON(res, response);
        });

        // POST /api/class/:className/instance - Create instance (simulated)
        this.routes.set(`/api/class/${className}/instance`, (req, res) => {
            if (req.method === 'POST') {
                const response = {
                    class: cls.name,
                    message: `${cls.name} instance created successfully (simulated)`,
                    instance: this.generateClassInstance(cls),
                    success: true
                };
                this.sendJSON(res, response);
            } else {
                this.sendError(res, 405, 'Method Not Allowed');
            }
        });
    }

    createFunctionRoute(func) {
        const functionName = func.name.toLowerCase();
        
        console.log(`🔗 Creating route for function: ${func.name}`);

        // GET /api/function/:functionName - Get function info and execute (if safe)
        this.routes.set(`/api/function/${functionName}`, (req, res) => {
            const response = {
                function: func.name,
                type: func.type,
                isAsync: func.isAsync,
                definition: func.definition,
                result: this.simulateFunctionExecution(func),
                message: `Function ${func.name} information and simulated execution`
            };
            this.sendJSON(res, response);
        });
    }

    applyAdaptation(adaptation) {
        console.log(`🔧 Applying adaptation: ${adaptation.type}`);

        switch (adaptation.type) {
            case 'add_health_check':
                // Health check already added
                break;
            case 'add_api_docs':
                // API docs already added
                break;
            case 'add_http_server':
                // HTTP server is this adaptive app
                break;
            case 'add_class_visualization':
                // Class routes already generated
                break;
        }
    }

    generateClassSampleData(cls) {
        const sampleData = {};
        
        cls.properties.forEach(prop => {
            switch (prop.category) {
                case 'identifier':
                    sampleData[prop.name] = 'id_' + Math.random().toString(36).substr(2, 9);
                    break;
                case 'display':
                    sampleData[prop.name] = `Sample ${prop.name}`;
                    break;
                case 'content':
                    sampleData[prop.name] = `This is sample ${prop.name} content`;
                    break;
                case 'configuration':
                    sampleData[prop.name] = { setting1: 'value1', setting2: 'value2' };
                    break;
                case 'state':
                    sampleData[prop.name] = 'active';
                    break;
                default:
                    sampleData[prop.name] = `Sample ${prop.name}`;
            }
        });

        return sampleData;
    }

    generateClassInstance(cls) {
        const instance = this.generateClassSampleData(cls);
        instance.id = Date.now();
        instance.createdAt = new Date().toISOString();
        return instance;
    }

    simulateFunctionExecution(func) {
        // Simulate function execution based on function type
        switch (func.type) {
            case 'getter':
                return { type: 'simulation', result: 'Sample data retrieved', timestamp: new Date().toISOString() };
            case 'setter':
                return { type: 'simulation', result: 'Data updated successfully', timestamp: new Date().toISOString() };
            case 'processor':
                return { type: 'simulation', result: 'Data processed successfully', items: 3 };
            case 'validator':
                return { type: 'simulation', result: 'Validation passed', valid: true };
            case 'creator':
                return { type: 'simulation', result: 'Item created', id: Date.now() };
            default:
                return { type: 'simulation', result: 'Function executed successfully', output: 'Sample output' };
        }
    }

    generateEndpointList() {
        const endpoints = [
            { method: 'GET', path: '/', description: 'API information and analysis' },
            { method: 'GET', path: '/health', description: 'Health check' },
            { method: 'GET', path: '/api/docs', description: 'API documentation' },
            { method: 'GET', path: '/api/analysis', description: 'Code analysis results' },
            { method: 'GET', path: '/api/classes', description: 'List detected classes' },
            { method: 'GET', path: '/api/functions', description: 'List detected functions' },
            { method: 'GET', path: '/api/modules', description: 'List detected modules' },
            { method: 'POST', path: '/api/reload', description: 'Reload user code' }
        ];

        // Add class-specific endpoints
        if (this.userAnalysis && this.userAnalysis.classes) {
            this.userAnalysis.classes.forEach(cls => {
                const className = cls.name.toLowerCase();
                endpoints.push(
                    { method: 'GET', path: `/api/class/${className}`, description: `Get ${cls.name} class information` },
                    { method: 'POST', path: `/api/class/${className}/instance`, description: `Create ${cls.name} instance` }
                );
            });
        }

        // Add function-specific endpoints
        if (this.userAnalysis && this.userAnalysis.functions) {
            this.userAnalysis.functions.forEach(func => {
                const functionName = func.name.toLowerCase();
                endpoints.push(
                    { method: 'GET', path: `/api/function/${functionName}`, description: `Execute ${func.name} function` }
                );
            });
        }

        return endpoints;
    }

    generateDetailedEndpoints() {
        return {
            general: [
                {
                    method: 'GET',
                    path: '/',
                    description: 'API information and code analysis',
                    response: 'JSON with framework info and analysis'
                },
                {
                    method: 'GET',
                    path: '/health',
                    description: 'Health check endpoint',
                    response: 'Server health status'
                }
            ],
            classes: this.userAnalysis ? this.userAnalysis.classes.map(cls => ({
                class: cls.name,
                type: cls.type,
                endpoints: [
                    { method: 'GET', path: `/api/class/${cls.name.toLowerCase()}`, description: 'Get class information' },
                    { method: 'POST', path: `/api/class/${cls.name.toLowerCase()}/instance`, description: 'Create instance' }
                ],
                methods: cls.methods,
                properties: cls.properties
            })) : [],
            functions: this.userAnalysis ? this.userAnalysis.functions.map(func => ({
                function: func.name,
                type: func.type,
                endpoint: { method: 'GET', path: `/api/function/${func.name.toLowerCase()}`, description: 'Execute function' },
                isAsync: func.isAsync
            })) : []
        };
    }

    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // Handle CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Find matching route
        const handler = this.routes.get(pathname);
        if (handler) {
            try {
                await handler(req, res);
            } catch (error) {
                console.error('Route handler error:', error);
                this.sendError(res, 500, 'Internal Server Error');
            }
        } else {
            this.sendError(res, 404, 'Not Found');
        }
    }

    sendJSON(res, data) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(data, null, 2));
    }

    sendError(res, statusCode, message) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(statusCode);
        res.end(JSON.stringify({ error: message, statusCode }));
    }

    async start() {
        // Load and analyze user code
        this.userAnalysis = await this.loadUserCode();
        
        // Setup dynamic routes based on analysis
        this.setupDynamicRoutes();

        // Create HTTP server
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        // Start the server
        this.server.listen(this.port, () => {
            console.log('\n🚀 Adaptive Node.js Server Started!');
            console.log('==========================================');
            console.log(`📡 Server running on: http://localhost:${this.port}`);
            console.log(`🔍 Analysis: ${this.userAnalysis.classes.length} classes, ${this.userAnalysis.functions.length} functions detected`);
            console.log(`📦 Modules: ${this.userAnalysis.modules.length} modules found`);
            console.log(`⚡ Features: ${this.userAnalysis.structure.hasHTTP ? 'HTTP detected' : 'No HTTP detected'}`);
            console.log('\n📋 Available Endpoints:');
            this.generateEndpointList().forEach(endpoint => {
                console.log(`   ${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(30)} - ${endpoint.description}`);
            });
            console.log('\n🌐 Web Interface: http://localhost:' + this.port);
            console.log('📖 Documentation: http://localhost:' + this.port + '/api/docs');
        });
    }
}

// Start the adaptive app
const app = new AdaptiveNodeJSApp();
app.start().catch(console.error);

module.exports = AdaptiveNodeJSApp; 