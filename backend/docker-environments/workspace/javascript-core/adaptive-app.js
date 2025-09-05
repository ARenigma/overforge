const http = require('http');
const fs = require('fs');
const path = require('path');
const JavaScriptCoreAnalyzer = require('./adaptive-analyzer');

class JavaScriptCoreApp {
    constructor() {
        this.analyzer = new JavaScriptCoreAnalyzer();
        this.userCode = '';
        this.userGlobals = {};
        this.analysisResult = {};
        this.port = 3003;
    }

    async loadUserCode() {
        try {
            const userCodeFile = '/app/app.js';
            if (fs.existsSync(userCodeFile)) {
                this.userCode = fs.readFileSync(userCodeFile, 'utf8');
            } else {
                this.userCode = `
// No user code found
console.log('Hello from JavaScript Core!');

function greet(name) {
    return \`Hello, \${name}!\`;
}

class SimpleClass {
    constructor() {
        this.value = 42;
    }
    getValue() {
        return this.value;
    }
}
`;
            }

            // Analyze the code
            this.analysisResult = this.analyzer.analyzeCode(this.userCode);

            // Execute the code to make functions/classes available
            try {
                this.userGlobals = {};
                // Create a safer execution context
                const contextCode = `
                    ${this.userCode}
                    
                    // Export all functions and classes to global scope
                    if (typeof module !== 'undefined' && module.exports) {
                        // Handle CommonJS exports
                        Object.assign(global, module.exports);
                    }
                `;
                
                // Evaluate in a controlled way
                eval(contextCode);
                
                console.log(`📊 Analysis complete: ${this.analysisResult.classes?.length || 0} classes, ${this.analysisResult.functions?.length || 0} functions`);
            } catch (execError) {
                console.warn(`⚠️ Code execution warning: ${execError.message}`);
                // Analysis can still work even if execution fails
            }

        } catch (error) {
            console.error(`❌ Error loading user code: ${error.message}`);
            this.analysisResult = { error: error.message };
            this.userGlobals = {};
        }
    }

    async executeUserCode(code) {
        try {
            // Create output capture
            let output = '';
            const originalLog = console.log;
            console.log = (...args) => {
                output += args.join(' ') + '\n';
                originalLog(...args);
            };

            let result;
            try {
                // Try to evaluate as expression first
                result = eval(code);
            } catch (e) {
                // If that fails, execute as statement
                eval(code);
                result = undefined;
            }

            // Restore console.log
            console.log = originalLog;

            return {
                result: result,
                output: output,
                type: typeof result
            };
        } catch (error) {
            throw error;
        }
    }

    handleRequest(req, res) {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const path = url.pathname;
        const method = req.method;

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (path === '/' && method === 'GET') {
            this.handleHome(req, res);
        } else if (path === '/health' && method === 'GET') {
            this.handleHealth(req, res);
        } else if (path === '/api/docs' && method === 'GET') {
            this.handleApiDocs(req, res);
        } else if (path === '/api/analysis' && method === 'GET') {
            this.handleAnalysis(req, res);
        } else if (path === '/api/reload' && method === 'POST') {
            this.handleReload(req, res);
        } else if (path === '/api/execute' && method === 'POST') {
            this.handleExecute(req, res);
        } else if (path === '/api/classes' && method === 'GET') {
            this.handleClasses(req, res);
        } else if (path === '/api/functions' && method === 'GET') {
            this.handleFunctions(req, res);
        } else if (path.startsWith('/api/class/') && method === 'GET') {
            this.handleClassInfo(req, res, path);
        } else if (path.startsWith('/api/function/') && method === 'GET') {
            this.handleFunctionInfo(req, res, path);
        } else if (path.startsWith('/api/function/') && path.endsWith('/execute') && method === 'POST') {
            this.handleFunctionExecute(req, res, path);
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    }

    handleHome(req, res) {
        res.writeHead(200);
        res.end(JSON.stringify({
            framework: 'JavaScript Core (Adaptive)',
            version: '1.0.0',
            description: 'Adaptive JavaScript code execution with intelligent analysis',
            analysis: this.analysisResult,
            endpoints: this.getAvailableEndpoints(),
            features: [
                'Automatic code structure detection',
                'Smart class and function analysis',
                'Dynamic API generation',
                'Code complexity analysis',
                'Pattern recognition (ES6, async, modules)',
                'Interactive code execution'
            ]
        }));
    }

    handleHealth(req, res) {
        res.writeHead(200);
        res.end(JSON.stringify({
            status: 'healthy',
            framework: 'javascript-core',
            adaptive: true
        }));
    }

    handleApiDocs(req, res) {
        res.writeHead(200);
        res.end(JSON.stringify({
            title: 'JavaScript Core Adaptive API',
            description: 'Auto-generated endpoints based on your JavaScript code',
            analysis: this.analysisResult,
            endpoints: this.getAvailableEndpoints(),
            code_statistics: this.getCodeStatistics()
        }));
    }

    handleAnalysis(req, res) {
        res.writeHead(200);
        res.end(JSON.stringify(this.analysisResult));
    }

    async handleReload(req, res) {
        try {
            await this.loadUserCode();
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                message: 'Code reloaded and analyzed successfully',
                analysis: this.analysisResult
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    async handleExecute(req, res) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                let code;
                try {
                    const data = JSON.parse(body);
                    code = data.code;
                } catch (e) {
                    // Try as plain text
                    code = body;
                }

                if (!code) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'No code provided' }));
                    return;
                }

                const result = await this.executeUserCode(code);

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    result: result,
                    message: 'Code executed successfully'
                }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({
                    success: false,
                    error: error.message
                }));
            }
        });
    }

    handleClasses(req, res) {
        const classes = this.analysisResult.classes || [];
        res.writeHead(200);
        res.end(JSON.stringify({
            classes: classes,
            count: classes.length
        }));
    }

    handleFunctions(req, res) {
        const functions = this.analysisResult.functions || [];
        res.writeHead(200);
        res.end(JSON.stringify({
            functions: functions,
            count: functions.length
        }));
    }

    handleClassInfo(req, res, path) {
        const className = path.split('/')[3];
        const classes = this.analysisResult.classes || [];
        const classInfo = classes.find(c => c.name.toLowerCase() === className.toLowerCase());

        if (!classInfo) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: `Class ${className} not found` }));
            return;
        }

        res.writeHead(200);
        res.end(JSON.stringify(classInfo));
    }

    handleFunctionInfo(req, res, path) {
        const functionName = path.split('/')[3];
        const functions = this.analysisResult.functions || [];
        const funcInfo = functions.find(f => f.name.toLowerCase() === functionName.toLowerCase());

        if (!funcInfo) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: `Function ${functionName} not found` }));
            return;
        }

        res.writeHead(200);
        res.end(JSON.stringify(funcInfo));
    }

    handleFunctionExecute(req, res, path) {
        const functionName = path.split('/')[3];
        const functions = this.analysisResult.functions || [];
        const funcInfo = functions.find(f => f.name.toLowerCase() === functionName.toLowerCase());

        if (!funcInfo) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: `Function ${functionName} not found` }));
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                let args = [];
                let kwargs = {};

                try {
                    const data = JSON.parse(body);
                    args = data.args || [];
                    kwargs = data.kwargs || {};
                } catch (e) {
                    // Default to empty args
                }

                // Try to get the function from global scope
                const func = global[funcInfo.name] || eval(funcInfo.name);
                if (typeof func !== 'function') {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: `Function ${functionName} not available in runtime` }));
                    return;
                }

                // Execute function
                const result = func(...args);

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    result: result,
                    function_name: funcInfo.name,
                    args_used: args,
                    kwargs_used: kwargs
                }));
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({
                    success: false,
                    error: error.message
                }));
            }
        });
    }

    getAvailableEndpoints() {
        const endpoints = [
            { method: 'GET', path: '/', description: 'Framework info and analysis' },
            { method: 'GET', path: '/health', description: 'Health check' },
            { method: 'GET', path: '/api/docs', description: 'API documentation' },
            { method: 'GET', path: '/api/analysis', description: 'Detailed code analysis' },
            { method: 'POST', path: '/api/reload', description: 'Reload user code' },
            { method: 'POST', path: '/api/execute', description: 'Execute arbitrary code' },
            { method: 'GET', path: '/api/classes', description: 'Get all classes' },
            { method: 'GET', path: '/api/functions', description: 'Get all functions' }
        ];

        // Add dynamic endpoints based on analysis
        for (const classInfo of this.analysisResult.classes || []) {
            const className = classInfo.name.toLowerCase();
            endpoints.push({
                method: 'GET',
                path: `/api/class/${className}`,
                description: `Get ${classInfo.name} class info`
            });
        }

        for (const funcInfo of this.analysisResult.functions || []) {
            const funcName = funcInfo.name.toLowerCase();
            endpoints.push(
                {
                    method: 'GET',
                    path: `/api/function/${funcName}`,
                    description: `Get ${funcInfo.name} function info`
                },
                {
                    method: 'POST',
                    path: `/api/function/${funcName}/execute`,
                    description: `Execute ${funcInfo.name} function`
                }
            );
        }

        return endpoints;
    }

    getCodeStatistics() {
        return {
            total_classes: (this.analysisResult.classes || []).length,
            total_functions: (this.analysisResult.functions || []).length,
            total_imports: (this.analysisResult.imports || []).length,
            total_variables: (this.analysisResult.variables || []).length,
            complexity_score: this.analysisResult.complexity_score || 0,
            code_style: this.analysisResult.code_style || 'unknown',
            detected_patterns: this.analysisResult.detected_patterns || []
        };
    }

    async run() {
        // Load user code on startup
        await this.loadUserCode();

        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        server.listen(this.port, '0.0.0.0', () => {
            console.log('🚀 JavaScript Core Adaptive App starting...');
            console.log(`📊 Detected: ${(this.analysisResult.classes || []).length} classes, ${(this.analysisResult.functions || []).length} functions`);
            console.log(`🌐 Available at: http://localhost:${this.port}`);
        });
    }
}

// Start the application
if (require.main === module) {
    const app = new JavaScriptCoreApp();
    app.run();
}

module.exports = JavaScriptCoreApp; 
 