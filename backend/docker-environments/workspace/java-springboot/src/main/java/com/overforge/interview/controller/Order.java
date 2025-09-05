package com.overforge.interview.controller;

import javax.persistence.*;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String customerName;
    
    @Column(nullable = false)
    private String customerEmail;
    
    @Column(nullable = false)
    private Double totalAmount;
    
    @Column(nullable = false)
    private String status;
    
    @Column(name = "order_date")
    private LocalDateTime orderDate;
    
    @Column
    private String shippingAddress;
    
    @Column
    private Integer itemCount;
    
    // Default constructor
    public Order() {
        this.orderDate = LocalDateTime.now();
        this.status = "PENDING";
    }
    
    // Constructor with parameters
    public Order(String customerName, String customerEmail, Double totalAmount) {
        this();
        this.customerName = customerName;
        this.customerEmail = customerEmail;
        this.totalAmount = totalAmount;
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    
    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }
    
    public Double getTotalAmount() { return totalAmount; }
    public void setTotalAmount(Double totalAmount) { this.totalAmount = totalAmount; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public LocalDateTime getOrderDate() { return orderDate; }
    public void setOrderDate(LocalDateTime orderDate) { this.orderDate = orderDate; }
    
    public String getShippingAddress() { return shippingAddress; }
    public void setShippingAddress(String shippingAddress) { this.shippingAddress = shippingAddress; }
    
    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer itemCount) { this.itemCount = itemCount; }
    
    // Business methods
    public void updateStatus(String newStatus) {
        this.status = newStatus;
    }
    
    public boolean isCompleted() {
        return "COMPLETED".equals(this.status);
    }
    
    public void applyDiscount(double percentage) {
        this.totalAmount = this.totalAmount * (1 - percentage / 100);
    }
    
    @Override
    public String toString() {
        return "Order{id=" + id + ", customerName=" + customerName + 
               ", totalAmount=" + totalAmount + ", status=" + status + "}";
    }
}
