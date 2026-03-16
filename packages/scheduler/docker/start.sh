#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

show_help() {
    cat << EOF
Usage: ./start.sh [OPTIONS]

Quản lý Docker Compose cho Sequence Scheduler

OPTIONS:
    -s, --service SERVICE   Service cần start (all|dragonfly|kafka)
                           Default: all
    -h, --help             Hiển thị help

ENVIRONMENT DETECTION:
    Script tự động đọc file .env để detect environment:
    - Nếu có APP_ENV=prod → prod
    - Nếu có APP_ENV=dev → dev
    - Nếu không có .env → dev (default)

FILES:
    .env                   # Main env file (auto-detect)
    .env.dev.example       # Dev template
    .env.prod.example      # Prod template

SERVICES:
    all         Start tất cả services (Dragonfly + Kafka + Zookeeper + Kafka UI)
    dragonfly   Chỉ start Dragonfly
    kafka       Chỉ start Kafka cluster (Zookeeper + Kafka + Kafka UI)

EXAMPLES:
    # Start tất cả (dev)
    ./start.sh

    # Start tất cả (prod)
    ./start.sh

    # Chỉ start Dragonfly
    ./start.sh -s dragonfly

    # Chỉ start Kafka
    ./start.sh -s kafka

COMPOSE FILES:
    Dev:
        - docker-compose.yml (main entry)
        - compose.base.yml
        - dragonfly.yml
        - kafka.yml

    Prod:
        - compose.prod.yml (main entry)
        - compose.base.yml
        - dragonfly.yml
        - kafka.yml
EOF
}

SERVICE="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--service)
            SERVICE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Auto-detect environment from .env file
ENV="dev"
ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
    # Read APP_ENV from .env
    APP_ENV=$(grep -E "^APP_ENV=" "$ENV_FILE" | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)

    if [ "$APP_ENV" = "prod" ]; then
        ENV="prod"
    elif [ "$APP_ENV" = "dev" ]; then
        ENV="dev"
    fi
else
    echo "⚠️  Warning: .env file not found. Using dev environment."
    echo "   Create .env from .env.dev.example or .env.prod.example"
fi

echo "🚀 Starting Sequence Scheduler ($ENV environment)..."
echo "   Service: $SERVICE"

# Select compose files based on environment and service
COMPOSE_FILES=""
case $SERVICE in
    all)
        if [ "$ENV" = "prod" ]; then
            COMPOSE_FILES="-f compose.prod.yml"
        else
            COMPOSE_FILES="-f docker-compose.yml"
        fi
        ;;
    dragonfly)
        COMPOSE_FILES="-f dragonfly.yml"
        ;;
    kafka)
        COMPOSE_FILES="-f kafka.yml"
        ;;
    *)
        echo "❌ Invalid service: $SERVICE"
        echo "   Valid options: all, dragonfly, kafka"
        exit 1
        ;;
esac

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found"
    echo "   Create from template: cp .env.${ENV}.example .env"
    exit 1
fi

# Start services
echo "📦 Starting services..."
docker compose $COMPOSE_FILES --env-file "$ENV_FILE" up -d

echo ""
echo "✅ Services started successfully!"
echo ""
echo "📊 Service URLs:"
if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "kafka" ]; then
    echo "   Kafka UI: http://localhost:8090"
fi
if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "dragonfly" ]; then
    echo "   Dragonfly: localhost:6380"
fi
if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "kafka" ]; then
    echo "   Kafka: localhost:9092"
fi
echo ""
echo "🔍 Check logs:"
echo "   docker compose $COMPOSE_FILES logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker compose $COMPOSE_FILES down"
