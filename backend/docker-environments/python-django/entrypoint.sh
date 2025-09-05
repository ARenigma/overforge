#!/bin/bash

echo "🐍 Starting Django Interview Environment..."

# Wait for database if using PostgreSQL
if [ "$POSTGRES_DB" ]; then
    echo "⏳ Waiting for PostgreSQL..."
    while ! pg_isready -h $POSTGRES_HOST -p $POSTGRES_PORT > /dev/null 2>&1; do
        sleep 1
    done
    echo "✅ PostgreSQL is ready!"
fi

# Run migrations
echo "🔄 Running migrations..."
python manage.py makemigrations
python manage.py migrate

# Create superuser if it doesn't exist
echo "👤 Creating admin user..."
python manage.py shell -c "
from django.contrib.auth.models import User
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@interview.com', 'interview123')
    print('✅ Admin user created: admin/interview123')
else:
    print('ℹ️ Admin user already exists')
"

# Collect static files
echo "📁 Collecting static files..."
python manage.py collectstatic --noinput

echo "🚀 Django Interview Environment Ready!"
echo "🌐 Admin available at: http://localhost:8000/admin/"
echo "👤 Login: admin / interview123"

# Execute the main command
exec "$@" 