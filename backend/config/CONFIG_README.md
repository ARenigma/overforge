# 🚀 Overforge Backend Configuration Guide

## Overview

The Overforge backend uses a **streamlined configuration system** that automatically sets appropriate timing and behavior based on your `NODE_ENV`. This eliminates confusion and ensures consistent behavior across environments.

## 🎯 Key Principle: NODE_ENV Controls Everything

**The system automatically configures itself based on `NODE_ENV`:**

- **`development`**: Fast feedback (30s, 60s, 90s counter questions)
- **`test`**: Quick testing (15s, 30s, 45s counter questions)  
- **`production`**: Realistic timing (2min, 4min, 6min counter questions)

## 📁 Configuration Files

### 1. `app-config.js` - Main Configuration
- **Purpose**: Central configuration with environment-aware defaults
- **Key Feature**: `getIntervals()` method automatically returns correct timing based on NODE_ENV
- **Manual Overrides**: Only applied if environment variables are explicitly set

### 2. `environment-template.env` - Environment Variables Template
- **Purpose**: Template for creating your `.env` file
- **Key Feature**: Clear documentation of what NODE_ENV controls automatically
- **Manual Overrides**: Commented out by default, only uncomment if needed

## ⏱️ Counter Question Timing

### Automatic Timing (Recommended)
Just set `NODE_ENV` and timing is handled automatically:

```bash
# Development - Fast feedback
NODE_ENV=development
# Results in: 30s, 60s, 90s

# Test - Quick cycles  
NODE_ENV=test
# Results in: 15s, 30s, 45s

# Production - Realistic timing
NODE_ENV=production  
# Results in: 2min, 4min, 6min
```

### Manual Overrides (Only When Needed)
If you need custom timing, set these environment variables:

```bash
COUNTER_Q1_INTERVAL=45000   # 45 seconds
COUNTER_Q2_INTERVAL=90000   # 90 seconds  
COUNTER_Q3_INTERVAL=135000  # 2.25 minutes
```

**⚠️ Warning**: Manual overrides bypass NODE_ENV logic. Only use when you need specific custom timing.

## 🔧 Configuration Methods

### Getting Current Configuration
```javascript
const config = require('./config/app-config');

// Get current intervals (respects NODE_ENV + overrides)
const intervals = config.counterQuestions.getIntervals();
console.log(intervals); // { first: 30000, second: 60000, third: 90000 }

// Get as array for compatibility
const intervalArray = config.getCounterQuestionIntervals();
console.log(intervalArray); // [30000, 60000, 90000]

// Get full config summary
console.log(config.getConfigSummary());
```

### Configuration Summary Output
```
🚀 Overforge Backend (development)
   Counter Questions: 30000ms, 60000ms, 90000ms
   Code Analysis Debounce: 1500ms
   AI Timeout: 30000ms
   Test Mode: DISABLED
```

## 🧪 Testing Configuration

### E2E Testing
When `NODE_ENV=test`, the system automatically uses fast intervals (15s, 30s, 45s).

For even faster E2E testing, set:
```bash
TEST_COUNTER_Q_INTERVAL=5000  # 5-second intervals for rapid testing
```

### Test Mode Override
Force test mode regardless of NODE_ENV:
```bash
ENABLE_TEST_MODE=true
```

## 🚨 Common Issues & Solutions

### Issue: "My timing doesn't match NODE_ENV"
**Cause**: You have manual overrides set in your `.env` file
**Solution**: Remove or comment out `COUNTER_Q*_INTERVAL` variables to use NODE_ENV defaults

### Issue: "Counter questions are too fast/slow"
**Solution**: 
1. **Recommended**: Change `NODE_ENV` to appropriate environment
2. **Alternative**: Set manual overrides if you need custom timing

### Issue: "Configuration is confusing"
**Solution**: Use the streamlined approach:
1. Set `NODE_ENV` appropriately
2. Only set manual overrides if you need custom timing
3. Use `config.getConfigSummary()` to verify current settings

## 📊 Environment Comparison

| Environment | Counter Questions | Logging | Purpose |
|-------------|------------------|---------|---------|
| `development` | 30s, 60s, 90s | Debug | Fast feedback during development |
| `test` | 15s, 30s, 45s | Warn | Quick test cycles |
| `production` | 2min, 4min, 6min | Info | Realistic interview timing |

## 🔍 Debug Configuration

### View Current Configuration
```bash
# Start backend and check logs for configuration summary
npm start

# Or programmatically:
node -e "console.log(require('./config/app-config').getConfigSummary())"
```

### Debug Environment Variables
```bash
# Check what counter question variables are set
env | grep COUNTER

# Check NODE_ENV
echo $NODE_ENV
```

## 🎯 Best Practices

1. **Use NODE_ENV**: Let the system configure itself automatically
2. **Minimal Overrides**: Only set manual overrides when absolutely necessary
3. **Document Changes**: If you use manual overrides, document why
4. **Test Environments**: Use appropriate NODE_ENV for each environment
5. **Verify Configuration**: Use `getConfigSummary()` to confirm settings

## 🔄 Migration from Old System

If you're migrating from the old complex configuration system:

1. **Remove manual overrides** from your `.env` file
2. **Set appropriate NODE_ENV** for your environment
3. **Verify timing** using `getConfigSummary()`
4. **Only add manual overrides** if you need custom timing

This streamlined approach eliminates confusion and ensures consistent, predictable behavior across all environments. 