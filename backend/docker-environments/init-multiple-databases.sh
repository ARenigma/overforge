#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE django_interview_db;
    CREATE DATABASE springboot_interview_db;
    CREATE DATABASE express_interview_db;
    CREATE DATABASE nodejs_interview_db;
    
    GRANT ALL PRIVILEGES ON DATABASE django_interview_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE springboot_interview_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE express_interview_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE nodejs_interview_db TO $POSTGRES_USER;
EOSQL

echo "✅ Multiple databases created successfully!" 