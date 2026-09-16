# Sequence Scheduler - Docker Setup

Docker Compose configuration cho Sequence Scheduler system với Dragonfly.

## Cấu trúc

```
docker/
├── compose.base.yml       # Base config
├── compose.prod.yml       # Production entry
├── docker-compose.yml     # Development entry
├── dragonfly.yml          # Dragonfly service
├── start.sh               # Script khởi động
├── .env.dev.example       # Dev env template
└── .env.prod.example      # Prod env template
```

## Quick Start

### 1. Tạo file .env

```bash
# Development
cp .env.dev.example .env

# Production
cp .env.prod.example .env
```

### 2. Start Dragonfly

```bash
./start.sh
```

## Environment Variables

### Development (.env.dev.example)

- `APP_ENV=dev`
- `DRAGONFLY_PASSWORD=dev_password_change_in_prod`

### Production (.env.prod.example)

- `APP_ENV=prod`
- Đổi `DRAGONFLY_PASSWORD` thành strong password

## Service URL

- **Dragonfly:** `localhost:6380`

## Commands

```bash
# Start
./start.sh

# Stop
docker compose -f docker-compose.yml --env-file .env down

# Logs
docker compose -f docker-compose.yml --env-file .env logs -f

# Restart
docker compose -f docker-compose.yml --env-file .env restart
```

## Lưu ý bảo mật

Tạo password mạnh cho production:

```bash
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
```

## Troubleshooting

### Dragonfly không connect được

```bash
# Check logs
docker logs dragonfly-scheduler

# Test connection
redis-cli -h localhost -p 6380 -a 'your_password' ping
```
