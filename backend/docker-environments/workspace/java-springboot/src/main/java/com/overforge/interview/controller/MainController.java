package com.overforge.interview.controller;

public class User {
    private Long id;
    private String firstName;
    private String lastName;
    private String email;
    private String phoneNumber;
    private String role;
    private Boolean isActive;
    private Boolean isVerified;
    private java.util.Date registrationDate;
    private java.util.Date lastLoginDate;
    private String address;
    private Integer age;

    // Default constructor
    public User() {
        this.registrationDate = new java.util.Date();
        this.isActive = true;
        this.isVerified = false;
    }

    // Constructor with basic info
    public User(String firstName, String lastName, String email, String role) {
        this();
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.role = role;
    }

    // Business methods
    public String getFullName() {
        return firstName + " " + lastName;
    }

    public void verify() {
        this.isVerified = true;
    }

    public void updateLastLogin() {
        this.lastLoginDate = new java.util.Date();
    }

    public boolean canLogin() {
        return isActive && isVerified;
    }

    public int getDaysSinceRegistration() {
        if (registrationDate == null) return 0;
        long diffInMillis = new java.util.Date().getTime() - registrationDate.getTime();
        return (int) (diffInMillis / (24 * 60 * 60 * 1000));
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }

    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }

    public Boolean getIsVerified() { return isVerified; }
    public void setIsVerified(Boolean isVerified) { this.isVerified = isVerified; }

    public java.util.Date getRegistrationDate() { return registrationDate; }
    public void setRegistrationDate(java.util.Date registrationDate) { this.registrationDate = registrationDate; }

    public java.util.Date getLastLoginDate() { return lastLoginDate; }
    public void setLastLoginDate(java.util.Date lastLoginDate) { this.lastLoginDate = lastLoginDate; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }

    @Override
    public String toString() {
        return "User{" +
                "id=" + id +
                ", fullName='" + getFullName() + "'" +
                ", email='" + email + "'" +
                ", role='" + role + "'" +
                ", active=" + isActive +
                ", verified=" + isVerified +
                '}';
    }
}