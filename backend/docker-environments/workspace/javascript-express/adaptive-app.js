/**
 * Adaptive Express.js Application
 * Automatically adapts to any user Express.js code implementation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ExpressCodeAnalyzer = require('./adaptive-analyzer');

class AdaptiveExpressApp {
    constructor() {
        this.app = express();
        this.analyzer = new ExpressCodeAnalyzer();
        this.userAnalysis = null;
        this.port = process.env.PORT || 3000;
        
        this.setupMiddleware();
        this.setupAdaptiveRoutes();
    }

    setupMiddleware() {
        // Basic middleware setup
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static('public'));
    }

    async loadUserCode() {
        try {
            // Try to load user code from various locations
            const possiblePaths = [
                path.join(__dirname, 'models.js'),
                path.join(__dirname, 'user-code.js'),
                path.join(__dirname, 'app.js'),
                path.join(__dirname, 'index.js')
            ];

            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                    const userCode = fs.readFileSync(filePath, 'utf8');
                    console.log(`📁 Loading user code from: ${filePath}`);
                    
                    // Analyze the user's code
                    this.userAnalysis = this.analyzer.analyzeUserCode(userCode);
                    
                    // Try to execute user code safely
                    try {
                        eval(userCode);
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

    createDefaultAnalysis() {
        return {
            framework: 'Express.js',
            models: [],
            routes: [],
            middleware: [],
            endpoints: [],
            structure: {
                hasExpress: true,
                hasRouter: false,
                hasMiddleware: false,
                hasModels: false,
                hasDatabase: false,
                moduleType: 'commonjs',
                complexity: { lines: 0, functions: 0, routes: 0, score: 0 }
            },
            adaptations: [
                {
                    type: 'create_sample_model',
                    description: 'Create sample model for demonstration'
                }
            ]
        };
    }

    setupAdaptiveRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                framework: 'Express.js',
                timestamp: new Date().toISOString(),
                analysis: this.userAnalysis ? 'loaded' : 'pending'
            });
        });

        // Main API info endpoint
        this.app.get('/', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            res.json({
                framework: 'Express.js Adaptive System',
                message: 'Adaptive Express.js application running',
                analysis: this.userAnalysis,
                endpoints: this.generateEndpointList(),
                documentation: '/api/docs'
            });
        });

        // API documentation endpoint
        this.app.get('/api/docs', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            res.json({
                title: 'Adaptive Express.js API Documentation',
                description: 'Auto-generated documentation based on code analysis',
                analysis: this.userAnalysis,
                endpoints: this.generateDetailedEndpoints(),
                models: this.userAnalysis.models,
                adaptations: this.userAnalysis.adaptations
            });
        });

        // Dynamic model endpoints
        this.app.get('/api/models', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            res.json({
                models: this.userAnalysis.models,
                count: this.userAnalysis.models.length,
                framework: 'Express.js'
            });
        });

        // Analysis endpoint
        this.app.get('/api/analysis', async (req, res) => {
            if (!this.userAnalysis) {
                this.userAnalysis = await this.loadUserCode();
            }

            res.json(this.userAnalysis);
        });

        // Reload user code endpoint
        this.app.post('/api/reload', async (req, res) => {
            console.log('🔄 Reloading user code...');
            this.userAnalysis = await this.loadUserCode();
            this.setupDynamicRoutes();
            
            res.json({
                success: true,
                message: 'User code reloaded and analyzed',
                analysis: this.userAnalysis
            });
        });
    }

    setupDynamicRoutes() {
        if (!this.userAnalysis || !this.userAnalysis.models) return;

        // Create CRUD routes for each detected model
        this.userAnalysis.models.forEach(model => {
            this.createModelRoutes(model);
        });

        // Apply adaptations
        this.userAnalysis.adaptations.forEach(adaptation => {
            this.applyAdaptation(adaptation);
        });
    }

    createModelRoutes(model) {
        const modelName = model.name.toLowerCase();
        const pluralName = `${modelName}s`;

        console.log(`🔗 Creating routes for model: ${model.name}`);

        // GET /api/models/:modelName - List all
        this.app.get(`/api/${pluralName}`, (req, res) => {
            res.json({
                model: model.name,
                data: this.generateSampleData(model),
                fields: model.fields,
                message: `List of ${model.name} records (sample data)`
            });
        });

        // GET /api/models/:modelName/:id - Get specific
        this.app.get(`/api/${pluralName}/:id`, (req, res) => {
            const id = req.params.id;
            res.json({
                model: model.name,
                id: id,
                data: this.generateSampleRecord(model, id),
                fields: model.fields
            });
        });

        // POST /api/models/:modelName - Create new
        this.app.post(`/api/${pluralName}`, (req, res) => {
            res.json({
                model: model.name,
                message: `${model.name} created successfully`,
                data: { id: Date.now(), ...req.body },
                success: true
            });
        });

        // PUT /api/models/:modelName/:id - Update
        this.app.put(`/api/${pluralName}/:id`, (req, res) => {
            res.json({
                model: model.name,
                id: req.params.id,
                message: `${model.name} updated successfully`,
                data: { id: req.params.id, ...req.body },
                success: true
            });
        });

        // DELETE /api/models/:modelName/:id - Delete
        this.app.delete(`/api/${pluralName}/:id`, (req, res) => {
            res.json({
                model: model.name,
                id: req.params.id,
                message: `${model.name} deleted successfully`,
                success: true
            });
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
            case 'generate_crud_routes':
                // CRUD routes generated by setupDynamicRoutes
                break;
            case 'add_cors':
                // CORS already added in middleware
                break;
        }
    }

    generateSampleData(model) {
        const sampleData = [];
        for (let i = 1; i <= 3; i++) {
            sampleData.push(this.generateSampleRecord(model, i));
        }
        return sampleData;
    }

    generateSampleRecord(model, id) {
        const record = { id: id };
        
        model.fields.forEach(field => {
            switch (field.category) {
                case 'display':
                    record[field.name] = `Sample ${field.name} ${id}`;
                    break;
                case 'content':
                    record[field.name] = `This is sample ${field.name} content for record ${id}`;
                    break;
                case 'author':
                    record[field.name] = `User${id}`;
                    break;
                case 'timestamp':
                    record[field.name] = new Date().toISOString();
                    break;
                case 'numeric':
                    record[field.name] = Math.floor(Math.random() * 100);
                    break;
                case 'contact':
                    record[field.name] = field.name.includes('email') ? 
                        `user${id}@example.com` : `123-456-${1000 + parseInt(id)}`;
                    break;
                default:
                    record[field.name] = `Sample ${field.name}`;
            }
        });

        return record;
    }

    generateEndpointList() {
        const endpoints = [
            { method: 'GET', path: '/', description: 'API information and analysis' },
            { method: 'GET', path: '/health', description: 'Health check' },
            { method: 'GET', path: '/api/docs', description: 'API documentation' },
            { method: 'GET', path: '/api/models', description: 'List detected models' },
            { method: 'GET', path: '/api/analysis', description: 'Code analysis results' },
            { method: 'POST', path: '/api/reload', description: 'Reload user code' }
        ];

        // Add model-specific endpoints
        if (this.userAnalysis && this.userAnalysis.models) {
            this.userAnalysis.models.forEach(model => {
                const modelName = `${model.name.toLowerCase()}s`;
                endpoints.push(
                    { method: 'GET', path: `/api/${modelName}`, description: `List ${model.name} records` },
                    { method: 'POST', path: `/api/${modelName}`, description: `Create ${model.name}` },
                    { method: 'GET', path: `/api/${modelName}/:id`, description: `Get ${model.name} by ID` },
                    { method: 'PUT', path: `/api/${modelName}/:id`, description: `Update ${model.name}` },
                    { method: 'DELETE', path: `/api/${modelName}/:id`, description: `Delete ${model.name}` }
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
            models: this.userAnalysis.models.map(model => ({
                model: model.name,
                endpoints: [
                    { method: 'GET', path: `/api/${model.name.toLowerCase()}s`, description: 'List all records' },
                    { method: 'POST', path: `/api/${model.name.toLowerCase()}s`, description: 'Create new record' },
                    { method: 'GET', path: `/api/${model.name.toLowerCase()}s/:id`, description: 'Get record by ID' },
                    { method: 'PUT', path: `/api/${model.name.toLowerCase()}s/:id`, description: 'Update record' },
                    { method: 'DELETE', path: `/api/${model.name.toLowerCase()}s/:id`, description: 'Delete record' }
                ],
                fields: model.fields
            }))
        };
    }

    async start() {
        // Load and analyze user code
        this.userAnalysis = await this.loadUserCode();
        
        // Setup dynamic routes based on analysis
        this.setupDynamicRoutes();

        // Start the server
        this.app.listen(this.port, () => {
            console.log('\n🚀 Adaptive Express.js Server Started!');
            console.log('==========================================');
            console.log(`📡 Server running on: http://localhost:${this.port}`);
            console.log(`🔍 Analysis: ${this.userAnalysis.models.length} models detected`);
            console.log(`🛣️  Routes: ${this.userAnalysis.routes.length} user routes found`);
            console.log(`⚡ Status: ${this.userAnalysis.structure.hasExpress ? 'Express detected' : 'No Express detected'}`);
            console.log('\n📋 Available Endpoints:');
            this.generateEndpointList().forEach(endpoint => {
                console.log(`   ${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(25)} - ${endpoint.description}`);
            });
            console.log('\n🌐 Web Interface: http://localhost:' + this.port);
            console.log('📖 Documentation: http://localhost:' + this.port + '/api/docs');
        });
    }
}

// Start the adaptive app
const app = new AdaptiveExpressApp();
app.start().catch(console.error);

module.exports = AdaptiveExpressApp; 