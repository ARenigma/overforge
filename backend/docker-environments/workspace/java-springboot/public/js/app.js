// OverForge Express API Frontend JavaScript

let apiInfo = null;

// Load API information on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadAPIInfo();
});

async function loadAPIInfo() {
    try {
        const response = await fetch('/');
        apiInfo = await response.json();
        displayAPIInfo(apiInfo);
    } catch (error) {
        console.error('Failed to load API info:', error);
        document.getElementById('api-info').innerHTML = 
            '<div class="error">❌ Failed to load API information</div>';
    }
}

function displayAPIInfo(info) {
    const apiInfoDiv = document.getElementById('api-info');
    const endpointsSection = document.getElementById('endpoints-section');
    const endpointsList = document.getElementById('endpoints-list');
    
    // Display basic API information
    apiInfoDiv.innerHTML = `
        <h2>📊 API Information</h2>
        <div class="model-info">
            <div class="info-card">
                <h3>🎯 Detected Model</h3>
                <p>${info.model || 'No model detected'}</p>
            </div>
            <div class="info-card">
                <h3>📈 Total Records</h3>
                <p>${info.totalRecords || 0}</p>
            </div>
            <div class="info-card">
                <h3>⚡ Status</h3>
                <p>${info.status || 'Unknown'}</p>
            </div>
            <div class="info-card">
                <h3>🕐 Last Update</h3>
                <p>${new Date(info.timestamp).toLocaleTimeString()}</p>
            </div>
        </div>
        ${info.schema && Object.keys(info.schema).length > 0 ? 
            `<div class="schema-section">
                <div class="schema-title">📋 Model Schema</div>
                <div class="schema-fields">
                    ${Object.entries(info.schema).map(([field, type]) => 
                        `<div class="schema-field">
                            <span class="field-name">${field}</span>: 
                            <span class="field-type">${type}</span>
                        </div>`
                    ).join('')}
                </div>
            </div>` : ''
        }
    `;
    
    // Display endpoints if model is detected
    if (info.model && info.model !== 'No model detected') {
        endpointsSection.style.display = 'block';
        endpointsList.innerHTML = info.endpoints.map(endpoint => {
            const [method, path, description] = endpoint.split(' - ');
            const methodClass = method.startsWith('GET') ? 'get' : 
                               method.startsWith('POST') ? 'post' : 
                               method.startsWith('PUT') ? 'put' : 
                               method.startsWith('DELETE') ? 'delete' : '';
            
            return `
                <div class="endpoint">
                    <span class="method ${methodClass}">${method}</span>
                    <span class="path">${path || ''}</span>
                    <div class="description">${description || ''}</div>
                </div>
            `;
        }).join('');
    }
}

async function testAPI() {
    const resultsDiv = document.getElementById('test-results');
    resultsDiv.innerHTML = '🧪 Testing API endpoints...\n';
    
    if (!apiInfo || !apiInfo.model || apiInfo.model === 'No model detected') {
        resultsDiv.innerHTML += '❌ No model detected. Please define a model in models.js\n';
        return;
    }
    
    const modelPath = `/${apiInfo.model.toLowerCase()}s`;
    
    try {
        // Test GET all records
        resultsDiv.innerHTML += `\n📡 Testing GET ${modelPath}\n`;
        const getAllResponse = await fetch(modelPath);
        const getAllData = await getAllResponse.json();
        resultsDiv.innerHTML += `✅ Status: ${getAllResponse.status}\n`;
        resultsDiv.innerHTML += `📊 Records returned: ${getAllData.data ? getAllData.data.length : 0}\n`;
        
        if (getAllData.data && getAllData.data.length > 0) {
            // Test GET single record
            const firstId = getAllData.data[0].id;
            resultsDiv.innerHTML += `\n📡 Testing GET ${modelPath}/${firstId}\n`;
            const getSingleResponse = await fetch(`${modelPath}/${firstId}`);
            const getSingleData = await getSingleResponse.json();
            resultsDiv.innerHTML += `✅ Status: ${getSingleResponse.status}\n`;
            resultsDiv.innerHTML += `📄 Record found: ${getSingleData.data ? 'Yes' : 'No'}\n`;
            
            // Display sample record
            if (getSingleData.data) {
                resultsDiv.innerHTML += `\n📋 Sample Record:\n`;
                resultsDiv.innerHTML += JSON.stringify(getSingleData.data, null, 2) + '\n';
            }
        }
        
        // Test health endpoint
        resultsDiv.innerHTML += `\n📡 Testing GET /health\n`;
        const healthResponse = await fetch('/health');
        const healthData = await healthResponse.json();
        resultsDiv.innerHTML += `✅ Status: ${healthResponse.status}\n`;
        resultsDiv.innerHTML += `💚 Health: ${healthData.status}\n`;
        resultsDiv.innerHTML += `⏱️ Uptime: ${Math.round(healthData.uptime)}s\n`;
        
        resultsDiv.innerHTML += `\n🎉 All tests completed successfully!\n`;
        
    } catch (error) {
        resultsDiv.innerHTML += `\n❌ Test failed: ${error.message}\n`;
    }
}

async function reloadModel() {
    const resultsDiv = document.getElementById('test-results');
    resultsDiv.innerHTML = '🔄 Reloading model...\n';
    
    try {
        const response = await fetch('/reload-model', { method: 'POST' });
        const data = await response.json();
        
        resultsDiv.innerHTML += `✅ Status: ${response.status}\n`;
        resultsDiv.innerHTML += `📦 Model: ${data.model}\n`;
        resultsDiv.innerHTML += `📈 Records: ${data.records}\n`;
        resultsDiv.innerHTML += `💬 Message: ${data.message}\n`;
        
        // Reload page info
        await loadAPIInfo();
        
    } catch (error) {
        resultsDiv.innerHTML += `❌ Reload failed: ${error.message}\n`;
    }
}