# Sequence Scheduler - Docker Setup

Docker Compose configuration cho Sequence Scheduler system với Dragonfly và Kafka.

## 📁 Cấu trúc

```
docker/
├── compose.base.yml       # Base config cho tất cả services
├── compose.dev.yml        # Development overrides
├── compose.prod.yml       # Production overrides
├── dragonfly.yml          # Standalone Dragonfly
├── kafka.yml              # Standalone Kafka cluster
├── start.sh               # Script khởi động
├── .env.dev.example       # Dev env template
├── .env.prod.example      # Prod env template
└── config/
    ├── kafka_server_jaas.conf
    └── zookeeper_jaas.conf
```

## 🚀 Quick Start

### 1. Tạo file .env

```bash
# Development
cp .env.dev.example .env

# Production
cp .env.prod.example .env
```

### 2. Start services

```bash
# Start tất cả (Dragonfly + Kafka)
./start.sh

# Chỉ start Dragonfly
./start.sh -s dragonfly

# Chỉ start Kafka
./start.sh -s kafka
```

## 🔧 Environment Variables

### Development (.env.dev.example)
- `APP_ENV=dev`
- `DRAGONFLY_PASSWORD=dev_password_change_in_prod`
- `KAFKA_ADMIN_PASSWORD=admin_dev_password`

### Production (.env.prod.example)
- `APP_ENV=prod`
- Đổi tất cả passwords thành strong passwords
- Cấu hình `KAFKA_EXTERNAL_HOST`

## 📊 Service URLs

- **Kafka UI:** http://localhost:8090
- **Dragonfly:** localhost:6380
- **Kafka:** localhost:9092 (external), kafka:9093 (internal)
- **Zookeeper:** localhost:2181

## 🛠️ Commands

```bash
# Start
./start.sh

# Stop
docker compose -f compose.base.yml -f compose.dev.yml down

# Logs
docker compose -f compose.base.yml -f compose.dev.yml logs -f

# Restart
docker compose -f compose.base.yml -f compose.dev.yml restart
```

## 🔐 Lưu Ý Bảo Mật

1. **Sinh mật khẩu mạnh:** Chạy lệnh sau để tạo mật khẩu 32 ký tự:
   ```bash
   openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
   ```
2. **Production:** Luôn đổi `DRAGONFLY_PASSWORD` và các `KAFKA_..._PASSWORD`.
3. **JAAS Config:** Cập nhật mật khẩu trong `config/kafka_server_jaas.conf` khớp với `.env`.

## 🐛 Troubleshooting

### Dragonfly không connect được
```bash
# Check logs
docker logs dragonfly-scheduler

# Test connection
redis-cli -h localhost -p 6380 -a 'your_password' ping
```

### Kafka không start
```bash
# Check Zookeeper
docker logs zookeeper-scheduler

# Check Kafka
docker logs kafka-scheduler
```

### Kafka UI không hiển thị topics
- Kiểm tra `KAFKA_ADMIN_PASSWORD` trong `.env` khớp với `kafka_server_jaas.conf`
