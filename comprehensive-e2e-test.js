const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

// Test scenarios covering major languages and frameworks
const TEST_SCENARIOS = [
    {
        id: 1,
        name: "Binary Search Tree (JavaScript)",
        language: "javascript",
        framework: "Node.js",
        problemType: "Data Structures",
        codePhases: [
            `// Binary Search Tree implementation
class TreeNode {
    constructor(val) {
        this.val = val;
        this.left = null;
        this.right = null;
    }
}`,
            `class BST {
    constructor() {
        this.root = null;
    }
    
    insert(val) {
        if (!this.root) {
            this.root = new TreeNode(val);
            return;
        }
        this.insertNode(this.root, val);
    }`,
            `    insertNode(node, val) {
        if (val < node.val) {
            if (!node.left) {
                node.left = new TreeNode(val);
            } else {
                this.insertNode(node.left, val);
            }
        } else {
            if (!node.right) {
                node.right = new TreeNode(val);
            } else {
                this.insertNode(node.right, val);
            }
        }
    }
    
    search(val) {
        return this.searchNode(this.root, val);
    }
    
    searchNode(node, val) {
        if (!node) return false;
        if (val === node.val) return true;
        return val < node.val ? 
            this.searchNode(node.left, val) : 
            this.searchNode(node.right, val);
    }
}`
        ],
        expectedAnswers: [
            "I chose a recursive approach for BST operations because it naturally maps to the tree structure. The insertion follows the BST property where smaller values go left and larger go right.",
            "I considered iterative approaches but recursion is more intuitive here. The trade-off is stack space usage vs code clarity. Iterative would be more memory efficient for very deep trees.",
            "For high-performance scenarios, I'd implement balancing (AVL/Red-Black) to maintain O(log n) operations. For concurrent access, I'd add proper locking mechanisms."
        ]
    },
    {
        id: 2,
        name: "REST API with Express (Node.js)",
        language: "javascript",
        framework: "Express.js",
        problemType: "Backend API",
        codePhases: [
            `const express = require('express');
const app = express();
app.use(express.json());

// User model simulation
const users = [];
let nextId = 1;`,
            `// GET all users
app.get('/api/users', (req, res) => {
    res.json(users);
});

// GET user by ID
app.get('/api/users/:id', (req, res) => {
    const user = users.find(u => u.id === parseInt(req.params.id));
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
});`,
            `// POST create user
app.post('/api/users', (req, res) => {
    const { name, email } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email required' });
    }
    
    const user = {
        id: nextId++,
        name,
        email,
        createdAt: new Date()
    };
    
    users.push(user);
    res.status(201).json(user);
});

app.listen(3000, () => console.log('Server running on port 3000'));`
        ],
        expectedAnswers: [
            "I built a RESTful API following standard conventions with proper HTTP methods and status codes. The structure is clean with clear endpoint patterns and error handling.",
            "I considered using a database like MongoDB or PostgreSQL instead of in-memory storage. The trade-off is simplicity vs persistence. For production, I'd definitely use a proper database with connection pooling.",
            "For scaling, I'd add authentication middleware, rate limiting, input validation with Joi, and database integration. For microservices, I'd split into separate services with API gateway."
        ]
    },
    {
        id: 3,
        name: "React Component with Hooks",
        language: "javascript",
        framework: "React",
        problemType: "Frontend Component",
        codePhases: [
            `import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserDashboard = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);`,
            `    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoading(true);
                const response = await axios.get('/api/users');
                setUsers(response.data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        
        fetchUsers();
    }, []);`,
            `    const handleDeleteUser = async (userId) => {
        try {
            await axios.delete(\`/api/users/\${userId}\`);
            setUsers(users.filter(user => user.id !== userId));
        } catch (err) {
            setError('Failed to delete user');
        }
    };
    
    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;
    
    return (
        <div className="user-dashboard">
            <h2>User Management</h2>
            {users.map(user => (
                <div key={user.id} className="user-card">
                    <h3>{user.name}</h3>
                    <p>{user.email}</p>
                    <button onClick={() => handleDeleteUser(user.id)}>
                        Delete
                    </button>
                </div>
            ))}
        </div>
    );
};

export default UserDashboard;`
        ],
        expectedAnswers: [
            "I used React hooks for state management with separate states for data, loading, and error handling. The useEffect handles the API call on component mount with proper cleanup.",
            "I considered using useReducer for more complex state management or React Query for server state. The trade-off is simplicity vs advanced features like caching and background updates.",
            "For large applications, I'd implement Redux or Zustand for global state, add proper loading skeletons, implement optimistic updates, and add proper error boundaries with retry mechanisms."
        ]
    },
    {
        id: 4,
        name: "Python Flask API with Authentication",
        language: "python",
        framework: "Flask",
        problemType: "Backend Security",
        codePhases: [
            `from flask import Flask, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
from functools import wraps

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'

users = {}`,
            `def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        try:
            token = token.split(' ')[1]  # Remove 'Bearer '
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = users.get(data['username'])
        except:
            return jsonify({'message': 'Token is invalid'}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated`,
            `@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if username in users:
        return jsonify({'message': 'User already exists'}), 400
    
    users[username] = {
        'username': username,
        'password': generate_password_hash(password),
        'created_at': datetime.datetime.utcnow()
    }
    
    return jsonify({'message': 'User created successfully'}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = users.get(username)
    if user and check_password_hash(user['password'], password):
        token = jwt.encode({
            'username': username,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.config['SECRET_KEY'])
        
        return jsonify({'token': token})
    
    return jsonify({'message': 'Invalid credentials'}), 401

@app.route('/protected', methods=['GET'])
@token_required
def protected(current_user):
    return jsonify({'message': f'Hello {current_user["username"]}!'})

if __name__ == '__main__':
    app.run(debug=True)`
        ],
        expectedAnswers: [
            "I implemented JWT-based authentication with password hashing using Werkzeug. The decorator pattern provides clean separation of concerns for route protection.",
            "I considered session-based auth vs JWT. JWT is stateless and better for microservices, but sessions offer better security control. Trade-off is scalability vs security granularity.",
            "For production, I'd add refresh tokens, rate limiting, password complexity validation, HTTPS enforcement, and proper secret management with environment variables."
        ]
    },
    {
        id: 5,
        name: "Django Model with Relationships",
        language: "python",
        framework: "Django",
        problemType: "ORM & Database",
        codePhases: [
            `from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator

class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name_plural = "Categories"
    
    def __str__(self):
        return self.name`,
            `class Product(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name`,
            `class Review(models.Model):
    RATING_CHOICES = [(i, i) for i in range(1, 6)]
    
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    rating = models.IntegerField(
        choices=RATING_CHOICES,
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['product', 'user']
        ordering = ['-created_at']
    
    def __str__(self):
        return f'{self.user.username} - {self.product.name} ({self.rating}/5)'

# Custom manager for active products
class ProductManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True)

# Add to Product model
Product.add_to_class('objects', models.Manager())
Product.add_to_class('active_objects', ProductManager())`
        ],
        expectedAnswers: [
            "I designed a normalized database schema with proper relationships using Django ORM. The models follow Django conventions with appropriate field types and constraints.",
            "I considered denormalization for performance but chose normalized design for data integrity. The trade-off is query complexity vs data consistency. I used related_name for reverse lookups.",
            "For high-traffic scenarios, I'd add database indexing, implement caching with Redis, use select_related/prefetch_related for query optimization, and consider read replicas for scaling."
        ]
    },
    {
        id: 6,
        name: "Java Spring Boot REST Controller",
        language: "java",
        framework: "Spring Boot",
        problemType: "Enterprise API",
        codePhases: [
            `package com.example.demo.controller;

import com.example.demo.model.User;
import com.example.demo.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {
    
    @Autowired
    private UserService userService;`,
            `    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        try {
            List<User> users = userService.getAllUsers();
            return new ResponseEntity<>(users, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<User> getUserById(@PathVariable Long id) {
        try {
            User user = userService.getUserById(id);
            if (user != null) {
                return new ResponseEntity<>(user, HttpStatus.OK);
            } else {
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            }
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }`,
            `    @PostMapping
    public ResponseEntity<User> createUser(@Valid @RequestBody User user) {
        try {
            User createdUser = userService.createUser(user);
            return new ResponseEntity<>(createdUser, HttpStatus.CREATED);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<User> updateUser(@PathVariable Long id, @Valid @RequestBody User user) {
        try {
            User updatedUser = userService.updateUser(id, user);
            if (updatedUser != null) {
                return new ResponseEntity<>(updatedUser, HttpStatus.OK);
            } else {
                return new ResponseEntity<>(HttpStatus.NOT_FOUND);
            }
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<HttpStatus> deleteUser(@PathVariable Long id) {
        try {
            userService.deleteUser(id);
            return new ResponseEntity<>(HttpStatus.NO_CONTENT);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}`
        ],
        expectedAnswers: [
            "I implemented a RESTful controller following Spring Boot conventions with proper dependency injection and HTTP status codes. The service layer separation provides clean architecture.",
            "I considered using @ResponseStatus annotations vs ResponseEntity. ResponseEntity gives more control over responses but is more verbose. I chose it for explicit status code management.",
            "For enterprise scaling, I'd add Spring Security for authentication, implement proper exception handling with @ControllerAdvice, add API versioning, and use Spring Boot Actuator for monitoring."
        ]
    },
    {
        id: 7,
        name: "C# ASP.NET Core Web API",
        language: "csharp",
        framework: "ASP.NET Core",
        problemType: "Enterprise API",
        codePhases: [
            `using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WebApi.Models;
using WebApi.Data;
using System.ComponentModel.DataAnnotations;

namespace WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        
        public ProductsController(ApplicationDbContext context)
        {
            _context = context;
        }`,
            `        [HttpGet]
        public async Task<ActionResult<IEnumerable<Product>>> GetProducts()
        {
            return await _context.Products
                .Include(p => p.Category)
                .Where(p => p.IsActive)
                .OrderByDescending(p => p.CreatedAt)
                .ToListAsync();
        }
        
        [HttpGet("{id}")]
        public async Task<ActionResult<Product>> GetProduct(int id)
        {
            var product = await _context.Products
                .Include(p => p.Category)
                .FirstOrDefaultAsync(p => p.Id == id);
                
            if (product == null)
            {
                return NotFound();
            }
            
            return product;
        }`,
            `        [HttpPost]
        public async Task<ActionResult<Product>> CreateProduct([FromBody] CreateProductDto productDto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }
            
            var product = new Product
            {
                Name = productDto.Name,
                Description = productDto.Description,
                Price = productDto.Price,
                CategoryId = productDto.CategoryId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            
            _context.Products.Add(product);
            await _context.SaveChangesAsync();
            
            return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product);
        }
        
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateProduct(int id, [FromBody] UpdateProductDto productDto)
        {
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }
            
            product.Name = productDto.Name;
            product.Description = productDto.Description;
            product.Price = productDto.Price;
            product.UpdatedAt = DateTime.UtcNow;
            
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
    
    public class CreateProductDto
    {
        [Required]
        [StringLength(200)]
        public string Name { get; set; }
        
        [Required]
        public string Description { get; set; }
        
        [Range(0.01, double.MaxValue)]
        public decimal Price { get; set; }
        
        [Required]
        public int CategoryId { get; set; }
    }
}`
        ],
        expectedAnswers: [
            "I built an async Web API controller using Entity Framework Core with proper DTOs for data validation. The async/await pattern ensures scalability under load.",
            "I considered using AutoMapper vs manual mapping. Manual mapping gives more control but AutoMapper reduces boilerplate. I chose manual for transparency in this simple case.",
            "For production, I'd add authentication with JWT, implement proper logging with Serilog, add API versioning, implement CQRS pattern with MediatR, and use distributed caching."
        ]
    },
    {
        id: 8,
        name: "Go Gin REST API with Middleware",
        language: "go",
        framework: "Gin",
        problemType: "Backend API",
        codePhases: [
            `package main

import (
    "net/http"
    "strconv"
    "time"
    
    "github.com/gin-gonic/gin"
    "github.com/gin-contrib/cors"
)

type User struct {
    ID        int       \`json:"id"\`
    Name      string    \`json:"name" binding:"required"\`
    Email     string    \`json:"email" binding:"required,email"\`
    CreatedAt time.Time \`json:"created_at"\`
}

var users []User
var nextID = 1`,
            `func authMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
            c.Abort()
            return
        }
        
        // Simple token validation (in production, use proper JWT)
        if token != "Bearer valid-token" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            c.Abort()
            return
        }
        
        c.Next()
    }
}

func loggerMiddleware() gin.HandlerFunc {
    return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
        return fmt.Sprintf("%s - [%s] \"%s %s %s %d %s \"%s\" %s\"\n",
            param.ClientIP,
            param.TimeStamp.Format(time.RFC1123),
            param.Method,
            param.Path,
            param.Request.Proto,
            param.StatusCode,
            param.Latency,
            param.Request.UserAgent(),
            param.ErrorMessage,
        )
    })
}`,
            `func main() {
    r := gin.Default()
    
    // Middleware
    r.Use(cors.Default())
    r.Use(loggerMiddleware())
    
    // Public routes
    r.POST("/register", registerUser)
    r.POST("/login", loginUser)
    
    // Protected routes
    api := r.Group("/api/users")
    api.Use(authMiddleware())
    {
        api.GET("/", getUsers)
        api.GET("/:id", getUserByID)
        api.POST("/", createUser)
        api.PUT("/:id", updateUser)
        api.DELETE("/:id", deleteUser)
    }
    
    r.Run(":8080")
}

func getUsers(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"users": users})
}

func getUserByID(c *gin.Context) {
    idStr := c.Param("id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
        return
    }
    
    for _, user := range users {
        if user.ID == id {
            c.JSON(http.StatusOK, user)
            return
        }
    }
    
    c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
}

func createUser(c *gin.Context) {
    var newUser User
    if err := c.ShouldBindJSON(&newUser); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    newUser.ID = nextID
    newUser.CreatedAt = time.Now()
    nextID++
    
    users = append(users, newUser)
    c.JSON(http.StatusCreated, newUser)
}`
        ],
        expectedAnswers: [
            "I used Gin's middleware system for cross-cutting concerns like authentication and logging. The router groups provide clean organization of protected vs public routes.",
            "I considered using net/http directly vs Gin framework. Gin provides more features and middleware but adds dependency. I chose Gin for productivity and built-in validation.",
            "For production, I'd implement proper JWT with RS256, add database integration with GORM, implement graceful shutdown, add Prometheus metrics, and use structured logging with logrus."
        ]
    },
    {
        id: 9,
        name: "Vue.js Component with Composition API",
        language: "javascript",
        framework: "Vue.js",
        problemType: "Frontend Component",
        codePhases: [
            `<template>
  <div class="todo-app">
    <h1>Todo List</h1>
    
    <form @submit.prevent="addTodo" class="add-todo-form">
      <input
        v-model="newTodo"
        type="text"
        placeholder="Add a new todo..."
        required
      />
      <button type="submit" :disabled="!newTodo.trim()">Add</button>
    </form>`,
            `    <div class="filters">
      <button
        v-for="filter in filters"
        :key="filter"
        @click="currentFilter = filter"
        :class="{ active: currentFilter === filter }"
      >
        {{ filter }}
      </button>
    </div>
    
    <ul class="todo-list">
      <li
        v-for="todo in filteredTodos"
        :key="todo.id"
        :class="{ completed: todo.completed }"
      >
        <input
          type="checkbox"
          v-model="todo.completed"
          @change="updateTodo(todo)"
        />
        <span class="todo-text">{{ todo.text }}</span>
        <button @click="deleteTodo(todo.id)" class="delete-btn">×</button>
      </li>
    </ul>
  </div>
</template>`,
            `<script>
import { ref, computed, onMounted, watch } from 'vue'

export default {
  name: 'TodoApp',
  setup() {
    const todos = ref([])
    const newTodo = ref('')
    const currentFilter = ref('All')
    const filters = ['All', 'Active', 'Completed']
    
    const filteredTodos = computed(() => {
      switch (currentFilter.value) {
        case 'Active':
          return todos.value.filter(todo => !todo.completed)
        case 'Completed':
          return todos.value.filter(todo => todo.completed)
        default:
          return todos.value
      }
    })
    
    const addTodo = () => {
      if (newTodo.value.trim()) {
        const todo = {
          id: Date.now(),
          text: newTodo.value.trim(),
          completed: false,
          createdAt: new Date()
        }
        todos.value.push(todo)
        newTodo.value = ''
        saveTodos()
      }
    }
    
    const deleteTodo = (id) => {
      todos.value = todos.value.filter(todo => todo.id !== id)
      saveTodos()
    }
    
    const updateTodo = (updatedTodo) => {
      const index = todos.value.findIndex(todo => todo.id === updatedTodo.id)
      if (index !== -1) {
        todos.value[index] = updatedTodo
        saveTodos()
      }
    }
    
    const saveTodos = () => {
      localStorage.setItem('todos', JSON.stringify(todos.value))
    }
    
    const loadTodos = () => {
      const savedTodos = localStorage.getItem('todos')
      if (savedTodos) {
        todos.value = JSON.parse(savedTodos)
      }
    }
    
    onMounted(() => {
      loadTodos()
    })
    
    watch(todos, saveTodos, { deep: true })
    
    return {
      todos,
      newTodo,
      currentFilter,
      filters,
      filteredTodos,
      addTodo,
      deleteTodo,
      updateTodo
    }
  }
}
</script>`
        ],
        expectedAnswers: [
            "I used Vue 3's Composition API for better code organization and reusability. The reactive refs and computed properties provide efficient reactivity with localStorage persistence.",
            "I considered Options API vs Composition API. Composition API offers better TypeScript support and logic reuse but has a steeper learning curve. I chose it for modern Vue development.",
            "For larger applications, I'd implement Pinia for state management, add proper TypeScript support, implement virtual scrolling for large lists, and add proper error handling with toast notifications."
        ]
    },
    {
        id: 10,
        name: "Ruby on Rails API Controller",
        language: "ruby",
        framework: "Rails",
        problemType: "Backend API",
        codePhases: [
            `class Api::V1::PostsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_post, only: [:show, :update, :destroy]
  
  # GET /api/v1/posts
  def index
    @posts = current_user.posts
                         .includes(:user, :comments)
                         .order(created_at: :desc)
                         .page(params[:page])
                         .per(20)
    
    render json: @posts, include: [:user, :comments], status: :ok
  end`,
            `  # GET /api/v1/posts/:id
  def show
    render json: @post, include: [:user, :comments], status: :ok
  end
  
  # POST /api/v1/posts
  def create
    @post = current_user.posts.build(post_params)
    
    if @post.save
      render json: @post, include: [:user], status: :created
    else
      render json: { errors: @post.errors }, status: :unprocessable_entity
    end
  end`,
            `  # PATCH/PUT /api/v1/posts/:id
  def update
    if @post.update(post_params)
      render json: @post, include: [:user], status: :ok
    else
      render json: { errors: @post.errors }, status: :unprocessable_entity
    end
  end
  
  # DELETE /api/v1/posts/:id
  def destroy
    @post.destroy
    head :no_content
  end
  
  private
  
  def set_post
    @post = current_user.posts.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Post not found' }, status: :not_found
  end
  
  def post_params
    params.require(:post).permit(:title, :content, :published)
  end
  
  def authenticate_user!
    token = request.headers['Authorization']&.split(' ')&.last
    
    begin
      decoded_token = JWT.decode(token, Rails.application.secret_key_base, true, algorithm: 'HS256')
      user_id = decoded_token[0]['user_id']
      @current_user = User.find(user_id)
    rescue JWT::DecodeError, ActiveRecord::RecordNotFound
      render json: { error: 'Unauthorized' }, status: :unauthorized
    end
  end
  
  def current_user
    @current_user
  end
end`
        ],
        expectedAnswers: [
            "I implemented a Rails API controller following RESTful conventions with proper authentication, pagination using Kaminari, and eager loading to prevent N+1 queries.",
            "I considered using Devise vs custom JWT authentication. Devise is more full-featured but heavier. I chose custom JWT for API-only applications with better mobile app compatibility.",
            "For production scaling, I'd add proper serializers with ActiveModel::Serializers, implement caching with Redis, add background jobs with Sidekiq, and use database read replicas."
        ]
    }
];

class ComprehensiveE2ETest {
    constructor() {
        this.results = [];
        this.socket = null;
        this.currentTest = null;
        this.startTime = null;
    }

    async runAllTests() {
        console.log('\n🎯 COMPREHENSIVE END-TO-END TESTING');
        console.log('=' .repeat(80));
        console.log(`Testing ${TEST_SCENARIOS.length} different scenarios across major languages and frameworks`);
        console.log('=' .repeat(80));

        for (const scenario of TEST_SCENARIOS) {
            console.log(`\n🚀 Starting Test ${scenario.id}/10: ${scenario.name}`);
            console.log(`   Language: ${scenario.language} | Framework: ${scenario.framework}`);
            console.log(`   Type: ${scenario.problemType}`);
            console.log('-'.repeat(60));

            try {
                const result = await this.runSingleTest(scenario);
                this.results.push(result);
                
                // Brief pause between tests
                await this.sleep(2000);
            } catch (error) {
                console.error(`❌ Test ${scenario.id} failed:`, error.message);
                this.results.push({
                    ...scenario,
                    success: false,
                    error: error.message,
                    duration: 0,
                    questionsReceived: 0
                });
            }
        }

        this.generateFinalReport();
    }

    async runSingleTest(scenario) {
        this.currentTest = scenario;
        this.startTime = Date.now();
        
        const sessionId = `e2e-${Date.now()}-${scenario.id}`;
        const questions = [];
        const timings = [];
        let feedbackCount = 0;
        
        return new Promise(async (resolve, reject) => {
            try {
                // Create session
                const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
                    language: scenario.language,
                    experienceLevel: 'senior',
                    userId: `test-user-${scenario.id}`,
                    problemId: scenario.id
                });

                if (sessionResponse.status !== 201) {
                    throw new Error('Failed to create session');
                }

                const actualSessionId = sessionResponse.data.sessionId;
                console.log(`✅ Session created: ${actualSessionId}`);

                // Connect to WebSocket
                this.socket = io(SOCKET_URL);
                
                this.socket.on('connect', () => {
                    console.log('✅ WebSocket connected');
                    
                    // First join room to initialize parameter session
                    this.socket.emit('joinRoom', {
                        roomName: actualSessionId,
                        userId: `test-user-${scenario.id}`,
                        username: 'Test User',
                        language: scenario.language,
                        experienceLevel: 'senior'
                    });

                    // Then join assessment room for LHIS
                    this.socket.emit('joinAssessmentRoom', {
                        sessionId: actualSessionId,
                        candidateId: `test-user-${scenario.id}`,
                        role: 'candidate'
                    });
                });

                this.socket.on('assessmentRoomJoined', (data) => {
                    console.log('✅ Assessment room joined');
                    this.startCodeSubmission(scenario, actualSessionId, questions, timings, feedbackCount, resolve);
                });

                this.socket.on('newMessage', (data) => {
                    if (data.sender && data.sender.name === 'LHIS' && data.message) {
                        const questionTime = Date.now() - this.startTime;
                        questions.push({
                            question: data.message,
                            timing: questionTime,
                            depth: questions.length + 1
                        });
                        timings.push(questionTime);
                        
                        console.log(`📝 Question ${questions.length} received (${questionTime}ms):`);
                        console.log(`   "${data.message.substring(0, 80)}..."`);
                    }
                });

                this.socket.on('chatMessage', (data) => {
                    if (data.message && data.message.includes('✅')) {
                        feedbackCount++;
                        console.log(`💬 Feedback ${feedbackCount}: ${data.message}`);
                    }
                });

                // Timeout after 3 minutes
                setTimeout(() => {
                    this.socket.disconnect();
                    resolve({
                        ...scenario,
                        success: questions.length >= 3,
                        duration: Date.now() - this.startTime,
                        questionsReceived: questions.length,
                        questions: questions,
                        timings: timings,
                        feedbackCount: feedbackCount,
                        averageResponseTime: timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 0
                    });
                }, 180000);

            } catch (error) {
                if (this.socket) this.socket.disconnect();
                reject(error);
            }
        });
    }

    async startCodeSubmission(scenario, sessionId, questions, timings, feedbackCount, resolve) {
        let phaseIndex = 0;
        
        const submitNextPhase = async () => {
            if (phaseIndex < scenario.codePhases.length) {
                const code = scenario.codePhases.slice(0, phaseIndex + 1).join('\n\n');
                
                console.log(`📤 Submitting code phase ${phaseIndex + 1}/${scenario.codePhases.length}`);
                console.log(`   Code length: ${code.length} characters`);
                
                this.socket.emit('assessmentCodeChange', {
                    sessionId: sessionId,
                    code: code,
                    language: scenario.language
                });
                
                phaseIndex++;
                
                // Wait for question or continue
                if (phaseIndex < scenario.codePhases.length) {
                    setTimeout(submitNextPhase, 8000); // 8 second intervals
                } else {
                    // All code submitted, start answering questions
                    setTimeout(() => this.startAnsweringQuestions(scenario, sessionId, questions, resolve), 5000);
                }
            }
        };
        
        // Start first phase
        setTimeout(submitNextPhase, 1000);
    }

    async startAnsweringQuestions(scenario, sessionId, questions, resolve) {
        console.log('🤖 Starting to answer questions...');
        
        let answerIndex = 0;
        
        const submitNextAnswer = async () => {
            if (answerIndex < questions.length && answerIndex < scenario.expectedAnswers.length) {
                const answer = scenario.expectedAnswers[answerIndex];
                
                console.log(`📝 Submitting answer ${answerIndex + 1}: "${answer.substring(0, 60)}..."`);
                
                this.socket.emit('submitParameterAnswer', {
                    sessionId: sessionId,
                    parameterId: 0,
                    answer: answer
                });
                
                answerIndex++;
                
                if (answerIndex < 3) {
                    setTimeout(submitNextAnswer, 10000); // 10 second intervals between answers
                } else {
                    // All answers submitted, wait a bit more and resolve
                    setTimeout(() => {
                        this.socket.disconnect();
                        resolve({
                            ...scenario,
                            success: questions.length >= 3,
                            duration: Date.now() - this.startTime,
                            questionsReceived: questions.length,
                            questions: questions,
                            timings: questions.map((q, i) => q.timing),
                            feedbackCount: 0, // Will be updated by socket events
                            averageResponseTime: questions.length > 0 ? 
                                questions.reduce((sum, q) => sum + q.timing, 0) / questions.length : 0
                        });
                    }, 15000);
                }
            }
        };
        
        // Start answering if we have questions
        if (questions.length > 0) {
            setTimeout(submitNextAnswer, 2000);
        } else {
            // Wait longer if no questions yet
            setTimeout(() => {
                if (questions.length > 0) {
                    submitNextAnswer();
                } else {
                    console.log('⚠️ No questions received, ending test');
                    this.socket.disconnect();
                    resolve({
                        ...scenario,
                        success: false,
                        duration: Date.now() - this.startTime,
                        questionsReceived: 0,
                        questions: [],
                        timings: [],
                        feedbackCount: 0,
                        averageResponseTime: 0
                    });
                }
            }, 30000);
        }
    }

    generateFinalReport() {
        console.log('\n' + '='.repeat(80));
        console.log('🎯 COMPREHENSIVE E2E TEST RESULTS');
        console.log('='.repeat(80));

        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);
        
        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total Tests: ${this.results.length}`);
        console.log(`   Successful: ${successful.length} (${Math.round(successful.length/this.results.length*100)}%)`);
        console.log(`   Failed: ${failed.length} (${Math.round(failed.length/this.results.length*100)}%)`);

        if (successful.length > 0) {
            const avgQuestions = successful.reduce((sum, r) => sum + r.questionsReceived, 0) / successful.length;
            const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
            const avgResponseTime = successful.reduce((sum, r) => sum + r.averageResponseTime, 0) / successful.length;
            
            console.log(`\n📈 PERFORMANCE METRICS:`);
            console.log(`   Average Questions per Test: ${avgQuestions.toFixed(1)}`);
            console.log(`   Average Test Duration: ${(avgDuration/1000).toFixed(1)}s`);
            console.log(`   Average Question Response Time: ${(avgResponseTime/1000).toFixed(1)}s`);
        }

        console.log(`\n🔍 DETAILED RESULTS:`);
        console.log('-'.repeat(80));

        this.results.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} Test ${index + 1}: ${result.name}`);
            console.log(`   Language: ${result.language} | Framework: ${result.framework}`);
            console.log(`   Questions: ${result.questionsReceived}/3 | Duration: ${(result.duration/1000).toFixed(1)}s`);
            
            if (result.success && result.questions) {
                result.questions.forEach((q, i) => {
                    console.log(`   Q${i+1} (${(q.timing/1000).toFixed(1)}s): "${q.question.substring(0, 60)}..."`);
                });
            }
            
            if (!result.success && result.error) {
                console.log(`   Error: ${result.error}`);
            }
            console.log();
        });

        // Language/Framework breakdown
        const byLanguage = {};
        this.results.forEach(r => {
            if (!byLanguage[r.language]) byLanguage[r.language] = { total: 0, success: 0 };
            byLanguage[r.language].total++;
            if (r.success) byLanguage[r.language].success++;
        });

        console.log(`🌍 LANGUAGE/FRAMEWORK BREAKDOWN:`);
        console.log('-'.repeat(50));
        Object.entries(byLanguage).forEach(([lang, stats]) => {
            const successRate = Math.round(stats.success/stats.total*100);
            console.log(`   ${lang}: ${stats.success}/${stats.total} (${successRate}%)`);
        });

        console.log('\n' + '='.repeat(80));
        
        const overallSuccess = successful.length >= 8; // 80% success rate
        if (overallSuccess) {
            console.log('🎉 COMPREHENSIVE E2E TEST: PASSED');
            console.log('✅ System is production-ready across multiple languages and frameworks!');
        } else {
            console.log('⚠️ COMPREHENSIVE E2E TEST: NEEDS IMPROVEMENT');
            console.log('❌ System needs fixes before production deployment');
        }
        console.log('='.repeat(80));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the comprehensive test
const tester = new ComprehensiveE2ETest();
tester.runAllTests().catch(console.error);
