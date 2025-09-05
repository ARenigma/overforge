const AWS = require('aws-sdk');

// Initialize AWS services
const sns = new AWS.SNS();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const EMAIL_TOPIC_ARN = process.env.EMAIL_TOPIC_ARN;
const SMS_TOPIC_ARN = process.env.SMS_TOPIC_ARN;

/**
 * AWS Lambda function to handle EventBridge events and send notifications
 * Processes user events and sends appropriate notifications via SNS
 */
exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        // Process each record in the event
        for (const record of event.Records || [event]) {
            await processEvent(record);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Events processed successfully' })
        };
    } catch (error) {
        console.error('Error processing events:', error);
        throw error;
    }
};

/**
 * Process individual EventBridge event
 */
async function processEvent(eventRecord) {
    const detail = eventRecord.detail || eventRecord;
    const eventType = eventRecord['detail-type'] || eventRecord.DetailType;
    
    console.log(`Processing event type: ${eventType}`);
    
    switch (eventType) {
        case 'user.registered':
            await handleUserRegistration(detail);
            break;
        case 'user.login':
            await handleUserLogin(detail);
            break;
        case 'user.profile_updated':
            await handleProfileUpdate(detail);
            break;
        default:
            console.log(`Unknown event type: ${eventType}`);
    }
}

/**
 * Handle user registration events
 */
async function handleUserRegistration(eventData) {
    const { user_id, email, name, notification_preferences } = eventData;
    
    console.log(`Processing registration for user: ${email}`);
    
    const welcomeMessage = {
        subject: 'Welcome to Our Platform!',
        body: `Hi ${name},\n\nWelcome to our platform! Your account has been successfully created.\n\nEmail: ${email}\n\nThank you for joining us!\n\nBest regards,\nThe Team`
    };
    
    // Send welcome notifications based on user preferences
    if (notification_preferences.email) {
        await sendEmailNotification(email, welcomeMessage.subject, welcomeMessage.body);
    }
    
    if (notification_preferences.sms) {
        const smsMessage = `Welcome ${name}! Your account has been created successfully. Welcome to our platform!`;
        await sendSMSNotification(email, smsMessage);
    }
    
    // Log notification activity
    await logNotificationActivity(user_id, 'registration', {
        email_sent: notification_preferences.email,
        sms_sent: notification_preferences.sms
    });
}

/**
 * Handle user login events
 */
async function handleUserLogin(eventData) {
    const { user_id, email, login_time } = eventData;
    
    console.log(`Processing login event for user: ${email}`);
    
    // Get user preferences
    const userPreferences = await getUserNotificationPreferences(user_id);
    
    if (!userPreferences) {
        console.log(`No preferences found for user: ${user_id}`);
        return;
    }
    
    // Send login notification if enabled
    if (userPreferences.login_notifications) {
        const loginMessage = {
            subject: 'Login Alert',
            body: `Hello,\n\nWe detected a login to your account at ${new Date(login_time).toLocaleString()}.\n\nIf this wasn't you, please contact support immediately.\n\nBest regards,\nSecurity Team`
        };
        
        if (userPreferences.email) {
            await sendEmailNotification(email, loginMessage.subject, loginMessage.body);
        }
        
        if (userPreferences.sms) {
            const smsMessage = `Login detected at ${new Date(login_time).toLocaleString()}. Contact support if this wasn't you.`;
            await sendSMSNotification(email, smsMessage);
        }
    }
    
    await logNotificationActivity(user_id, 'login', {
        email_sent: userPreferences.email && userPreferences.login_notifications,
        sms_sent: userPreferences.sms && userPreferences.login_notifications
    });
}

/**
 * Handle profile update events
 */
async function handleProfileUpdate(eventData) {
    const { user_id, updated_fields, update_time } = eventData;
    
    console.log(`Processing profile update for user: ${user_id}`);
    
    // Get user details
    const user = await getUserDetails(user_id);
    if (!user) {
        console.log(`User not found: ${user_id}`);
        return;
    }
    
    const userPreferences = user.notification_preferences;
    
    // Send profile update confirmation if enabled
    if (userPreferences.profile_updates) {
        const updateMessage = {
            subject: 'Profile Updated',
            body: `Hello ${user.name},\n\nYour profile has been updated successfully.\n\nUpdated fields: ${updated_fields.join(', ')}\nUpdate time: ${new Date(update_time).toLocaleString()}\n\nIf you didn't make these changes, please contact support.\n\nBest regards,\nThe Team`
        };
        
        if (userPreferences.email) {
            await sendEmailNotification(user.email, updateMessage.subject, updateMessage.body);
        }
        
        if (userPreferences.sms) {
            const smsMessage = `Profile updated: ${updated_fields.join(', ')}. Contact support if this wasn't you.`;
            await sendSMSNotification(user.email, smsMessage);
        }
    }
    
    await logNotificationActivity(user_id, 'profile_update', {
        email_sent: userPreferences.email && userPreferences.profile_updates,
        sms_sent: userPreferences.sms && userPreferences.profile_updates,
        updated_fields: updated_fields
    });
}

/**
 * Send email notification via SNS
 */
async function sendEmailNotification(email, subject, body) {
    try {
        const message = {
            email: email,
            subject: subject,
            body: body,
            timestamp: new Date().toISOString()
        };
        
        const params = {
            TopicArn: EMAIL_TOPIC_ARN,
            Message: JSON.stringify(message),
            Subject: subject,
            MessageAttributes: {
                'email': {
                    DataType: 'String',
                    StringValue: email
                },
                'notification_type': {
                    DataType: 'String',
                    StringValue: 'email'
                }
            }
        };
        
        const result = await sns.publish(params).promise();
        console.log(`Email notification sent: ${result.MessageId}`);
        
    } catch (error) {
        console.error('Failed to send email notification:', error);
        throw error;
    }
}

/**
 * Send SMS notification via SNS
 */
async function sendSMSNotification(email, message) {
    try {
        // Get user's phone number from database
        const user = await getUserByEmail(email);
        if (!user || !user.phone_number) {
            console.log(`No phone number found for user: ${email}`);
            return;
        }
        
        const smsMessage = {
            phone_number: user.phone_number,
            message: message,
            timestamp: new Date().toISOString()
        };
        
        const params = {
            TopicArn: SMS_TOPIC_ARN,
            Message: JSON.stringify(smsMessage),
            MessageAttributes: {
                'phone_number': {
                    DataType: 'String',
                    StringValue: user.phone_number
                },
                'notification_type': {
                    DataType: 'String',
                    StringValue: 'sms'
                }
            }
        };
        
        const result = await sns.publish(params).promise();
        console.log(`SMS notification sent: ${result.MessageId}`);
        
    } catch (error) {
        console.error('Failed to send SMS notification:', error);
        throw error;
    }
}

/**
 * Get user notification preferences
 */
async function getUserNotificationPreferences(userId) {
    try {
        const params = {
            TableName: USERS_TABLE,
            Key: { user_id: userId },
            ProjectionExpression: 'notification_preferences'
        };
        
        const result = await dynamodb.get(params).promise();
        return result.Item ? result.Item.notification_preferences : null;
    } catch (error) {
        console.error('Failed to get user preferences:', error);
        return null;
    }
}

/**
 * Get user details by user ID
 */
async function getUserDetails(userId) {
    try {
        const params = {
            TableName: USERS_TABLE,
            Key: { user_id: userId }
        };
        
        const result = await dynamodb.get(params).promise();
        return result.Item || null;
    } catch (error) {
        console.error('Failed to get user details:', error);
        return null;
    }
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
    try {
        const params = {
            TableName: USERS_TABLE,
            IndexName: 'EmailIndex', // Assume GSI on email
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        };
        
        const result = await dynamodb.query(params).promise();
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
        console.error('Failed to get user by email:', error);
        return null;
    }
}

/**
 * Log notification activity for auditing
 */
async function logNotificationActivity(userId, eventType, activityData) {
    try {
        const params = {
            TableName: 'NotificationLogs', // Separate table for logs
            Item: {
                log_id: `${userId}_${Date.now()}`,
                user_id: userId,
                event_type: eventType,
                activity_data: activityData,
                timestamp: new Date().toISOString()
            }
        };
        
        await dynamodb.put(params).promise();
        console.log(`Notification activity logged for user: ${userId}`);
    } catch (error) {
        console.error('Failed to log notification activity:', error);
        // Don't throw error - logging failure shouldn't stop notifications
    }
}