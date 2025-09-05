const fs = require("fs");
const path = require("path");

class FileManager {
    constructor() {
        this.basePath = process.cwd();
        this.files = [];
    }
    
    addFile(filename, content) {
        this.files.push({ filename, content, created: new Date() });
        return this;
    }
    
    listFiles() {
        return this.files.map(f => f.filename);
    }
    
    findFile(name) {
        return this.files.find(f => f.filename.includes(name));
    }
    
    deleteFile(filename) {
        this.files = this.files.filter(f => f.filename !== filename);
        return true;
    }
}

function processData(data) {
    console.log("Processing data:", data);
    return data.map(item => item.toString().toUpperCase());
}

async function fetchUserData(userId) {
    // Simulate async operation
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({ id: userId, name: `User ${userId}`, active: true });
        }, 100);
    });
}

const manager = new FileManager();
manager.addFile("test.txt", "Hello World");

console.log("FileManager and utility functions defined");
console.log("Files managed:", manager.listFiles().length);

module.exports = { FileManager, processData, fetchUserData, manager };
