const express = require("express");

class Product {
    constructor(name, price, category) {
        this.name = name;
        this.price = price;
        this.category = category;
        this.id = Date.now();
    }
    
    getDisplayName() {
        return `${this.name} - $${this.price}`;
    }
    
    applyDiscount(percent) {
        this.price = this.price * (1 - percent / 100);
        return this;
    }
}

// Create some sample data
const products = [
    new Product("Laptop", 999.99, "Electronics"),
    new Product("Coffee Mug", 12.99, "Kitchen"),
    new Product("Running Shoes", 79.99, "Sports")
];

console.log("Product model defined with", products.length, "sample items");

module.exports = { Product, products };
