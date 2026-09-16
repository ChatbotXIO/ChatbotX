#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

show_help() {
    cat << EOF
Usage: ./start.sh [OPTIONS]

Quản lý Docker Compose cho Sequence Scheduler

OPTIONS:
    -s, --service SERVICE   Service cần start (all|dragonfly)
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
    all         Start Dragonfly
    dragonfly   Start Dragonfly

EXAMPLES:
    ./start.sh
    ./start.sh -s dragonfly

COMPOSE FILES:
    Dev:
        - docker-compose.yml (main entry)
        - compose.base.yml
        - dragonfly.yml

    Prod:
        - compose.prod.yml (main entry)
        - compose.base.yml
        - dragonfly.yml
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

ENV="dev"
ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
    APP_ENV=$(grep -E "^APP_ENV=" "$ENV_FILE" | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)

    if [ "$APP_ENV" = "prod" ]; then
        ENV="prod"
    elif [ "$APP_ENV" = "dev" ]; then
        ENV="dev"
    fi
else
    echo "Warning: .env file not found. Using dev environment."
    echo "Create .env from .env.dev.example or .env.prod.example"
fi

echo "Starting Sequence Scheduler ($ENV environment)..."
echo "Service: $SERVICE"

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
    *)
        echo "Invalid service: $SERVICE"
        echo "Valid options: all, dragonfly"
        exit 1
        ;;
esac

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found"
    echo "Create from template: cp .env.${ENV}.example .env"
    exit 1
fi

echo "Starting services..."
docker compose $COMPOSE_FILES --env-file "$ENV_FILE" up -d

echo ""
echo "Services started successfully!"
echo ""
echo "Service URLs:"
echo "Dragonfly: localhost:6380"
echo ""
echo "Check logs:"
echo "docker compose $COMPOSE_FILES logs -f"
echo ""
echo "Stop services:"
echo "docker compose $COMPOSE_FILES down"
