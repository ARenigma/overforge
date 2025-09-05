import json
import boto3
import bcrypt
import uuid
from datetime import datetime

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
eventbridge = boto3.client('events')
table = dynamodb.Table('Users')

def lambda_handler(event, context):
    """
    AWS Lambda function for user management operations
    Handles registration, login, and profile updates with event publishing
    """
    
    try:
        http_method = event['httpMethod']
        path = event['path']
        body = json.loads(event.get('body', '{}'))
        
        if http_method == 'POST' and path == '/register':
            return handle_registration(body)
        elif http_method == 'POST' and path == '/login':
            return handle_login(body)
        elif http_method == 'PUT' and path == '/profile':
            return handle_profile_update(body, event)
        else:
            return create_response(400, {'error': 'Invalid endpoint'})
            
    except Exception as e:
        return create_response(500, {'error': str(e)})

def handle_registration(body):
    """Handle user registration with event publishing"""
    email = body.get('email')
    password = body.get('password')
    name = body.get('name')
    notification_preferences = body.get('notification_preferences', {'email': True, 'sms': False})
    
    if not email or not password or not name:
        return create_response(400, {'error': 'Missing required fields'})
    
    # Check if user exists
    try:
        existing_user = table.get_item(Key={'email': email})
        if 'Item' in existing_user:
            return create_response(409, {'error': 'User already exists'})
    except Exception:
        pass
    
    # Hash password and create user
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user_id = str(uuid.uuid4())
    
    user_data = {
        'user_id': user_id,
        'email': email,
        'name': name,
        'password': hashed_password,
        'notification_preferences': notification_preferences,
        'created_at': datetime.utcnow().isoformat(),
        'updated_at': datetime.utcnow().isoformat()
    }
    
    # Store user in DynamoDB
    table.put_item(Item=user_data)
    
    # Publish registration event to EventBridge
    publish_event('user.registered', {
        'user_id': user_id,
        'email': email,
        'name': name,
        'notification_preferences': notification_preferences
    })
    
    # Remove password from response
    user_data.pop('password')
    return create_response(201, {'message': 'User registered successfully', 'user': user_data})

def handle_login(body):
    """Handle user login with event publishing"""
    email = body.get('email')
    password = body.get('password')
    
    if not email or not password:
        return create_response(400, {'error': 'Email and password required'})
    
    # Get user from DynamoDB
    try:
        response = table.get_item(Key={'email': email})
        if 'Item' not in response:
            return create_response(401, {'error': 'Invalid credentials'})
        
        user = response['Item']
        
        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
            return create_response(401, {'error': 'Invalid credentials'})
        
        # Publish login event
        publish_event('user.login', {
            'user_id': user['user_id'],
            'email': user['email'],
            'login_time': datetime.utcnow().isoformat()
        })
        
        # Remove password from response
        user.pop('password')
        return create_response(200, {'message': 'Login successful', 'user': user})
        
    except Exception as e:
        return create_response(500, {'error': 'Login failed'})

def handle_profile_update(body, event):
    """Handle profile updates with event publishing"""
    # Extract user_id from JWT token or headers (simplified)
    user_id = event.get('requestContext', {}).get('authorizer', {}).get('user_id')
    
    if not user_id:
        return create_response(401, {'error': 'Unauthorized'})
    
    update_data = {}
    update_expression_parts = []
    expression_attribute_values = {}
    
    # Build dynamic update expression
    if 'name' in body:
        update_expression_parts.append('name = :name')
        expression_attribute_values[':name'] = body['name']
        update_data['name'] = body['name']
    
    if 'notification_preferences' in body:
        update_expression_parts.append('notification_preferences = :prefs')
        expression_attribute_values[':notification_preferences'] = body['notification_preferences']
        update_data['notification_preferences'] = body['notification_preferences']
    
    if not update_expression_parts:
        return create_response(400, {'error': 'No valid fields to update'})
    
    # Add updated timestamp
    update_expression_parts.append('updated_at = :updated_at')
    expression_attribute_values[':updated_at'] = datetime.utcnow().isoformat()
    
    update_expression = 'SET ' + ', '.join(update_expression_parts)
    
    # Update user in DynamoDB
    try:
        table.update_item(
            Key={'user_id': user_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues='ALL_NEW'
        )
        
        # Publish profile update event
        publish_event('user.profile_updated', {
            'user_id': user_id,
            'updated_fields': list(update_data.keys()),
            'update_time': datetime.utcnow().isoformat()
        })
        
        return create_response(200, {'message': 'Profile updated successfully'})
        
    except Exception as e:
        return create_response(500, {'error': 'Profile update failed'})

def publish_event(event_type, event_data):
    """Publish event to EventBridge"""
    try:
        eventbridge.put_events(
            Entries=[
                {
                    'Source': 'user-management-service',
                    'DetailType': event_type,
                    'Detail': json.dumps(event_data),
                    'EventBusName': 'notification-event-bus'
                }
            ]
        )
    except Exception as e:
        print(f"Failed to publish event: {str(e)}")

def create_response(status_code, body):
    """Create standardized HTTP response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(body)
    }