# AhaChat Deployment Guide for Google Cloud Platform

This guide covers deploying your AhaChat application to Google Cloud Platform (GCP) with all three apps: Builder (Next.js), Worker (BullMQ), and Partysocket (PartyKit).

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Cloud Run     │    │   Cloud Run     │
│   (HTTPS)       │───▶│   (Builder)     │    │   (Partysocket) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Cloud Run     │    │   Cloud SQL     │
                       │   (Worker)      │    │   (PostgreSQL)  │
                       └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Memorystore   │    │   Cloud Storage │
                       │   (Redis)       │    │   (S3-compatible)│
                       └─────────────────┘    └─────────────────┘
```

## Prerequisites

1. **Google Cloud SDK** installed and configured
2. **Docker** installed locally
3. **kubectl** (if using GKE)
4. **gcloud** CLI authenticated with your GCP project

## Option 1: Cloud Run Deployment (Recommended)

### 1. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com
```

### 2. Set Environment Variables

```bash
# Set your project ID
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# Set region
export REGION="us-central1"
gcloud config set run/region $REGION
```

### 3. Create Environment File

Copy `env.production.example` to `.env.production` and update with your values:

```bash
cp env.production.example .env.production
# Edit .env.production with your actual values
```

### 4. Deploy Infrastructure

#### Create Cloud SQL Instance (PostgreSQL)

```bash
gcloud sql instances create ahachat-postgres \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup-start-time=02:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=02

# Create database
gcloud sql databases create ahachatai --instance=ahachat-postgres

# Create user
gcloud sql users create ahachatai \
  --instance=ahachat-postgres \
  --password="your_secure_password"

# Get connection info
gcloud sql instances describe ahachat-postgres --format="value(connectionName)"
```

#### Create Memorystore Instance (Redis)

```bash
gcloud redis instances create ahachat-redis \
  --size=1 \
  --region=$REGION \
  --redis-version=redis_7_0
```

#### Create Cloud Storage Bucket (S3-compatible)

```bash
gsutil mb -l $REGION gs://ahachat-storage
gsutil iam ch allUsers:objectViewer gs://ahachat-storage
```

### 5. Build and Deploy Applications

#### Build Docker Images

```bash
# Build all images
docker-compose -f docker-compose.prod.yml build

# Tag images for Google Container Registry
docker tag ahachatai-prod-builder:latest gcr.io/$PROJECT_ID/ahachat-builder:latest
docker tag ahachatai-prod-worker:latest gcr.io/$PROJECT_ID/ahachat-worker:latest
docker tag ahachatai-prod-partysocket:latest gcr.io/$PROJECT_ID/ahachat-partysocket:latest

# Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/ahachat-builder:latest
docker push gcr.io/$PROJECT_ID/ahachat-worker:latest
docker push gcr.io/$PROJECT_ID/ahachat-partysocket:latest
```

#### Deploy to Cloud Run

```bash
# Deploy Builder (Next.js)
gcloud run deploy ahachat-builder \
  --image gcr.io/$PROJECT_ID/ahachat-builder:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 3000 \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=postgresql://ahachatai:password@/ahachatai?host=/cloudsql/$PROJECT_ID:$REGION:ahachat-postgres,REDIS_URL=redis://10.0.0.3:6379,MINIO_ENDPOINT=https://storage.googleapis.com,MINIO_ACCESS_KEY=your_access_key,MINIO_SECRET_KEY=your_secret_key,PARTYSOCKET_URL=https://ahachat-partysocket-xxxxx-uc.a.run.app" \
  --add-cloudsql-instances $PROJECT_ID:$REGION:ahachat-postgres

# Deploy Worker
gcloud run deploy ahachat-worker \
  --image gcr.io/$PROJECT_ID/ahachat-worker:latest \
  --platform managed \
  --region $REGION \
  --no-allow-unauthenticated \
  --port 3000 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=postgresql://ahachatai:password@/ahachatai?host=/cloudsql/$PROJECT_ID:$REGION:ahachat-postgres,REDIS_URL=redis://10.0.0.3:6379,MINIO_ENDPOINT=https://storage.googleapis.com,MINIO_ACCESS_KEY=your_access_key,MINIO_SECRET_KEY=your_secret_key" \
  --add-cloudsql-instances $PROJECT_ID:$REGION:ahachat-postgres

# Deploy Partysocket
gcloud run deploy ahachat-partysocket \
  --image gcr.io/$PROJECT_ID/ahachat-partysocket:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 1999 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=postgresql://ahachatai:password@/ahachatai?host=/cloudsql/$PROJECT_ID:$REGION:ahachat-postgres,REDIS_URL=redis://10.0.0.3:6379,MINIO_ENDPOINT=https://storage.googleapis.com,MINIO_ACCESS_KEY=your_access_key,MINIO_SECRET_KEY=your_secret_key" \
  --add-cloudsql-instances $PROJECT_ID:$REGION:ahachat-postgres
```

### 6. Set Up Load Balancer (Optional)

```bash
# Create external HTTPS load balancer
gcloud compute url-maps create ahachat-lb \
  --default-service ahachat-builder

# Create HTTPS proxy
gcloud compute target-https-proxies create ahachat-https-proxy \
  --url-map=ahachat-lb \
  --ssl-certificates=your-ssl-cert

# Create forwarding rule
gcloud compute forwarding-rules create ahachat-https \
  --target-https-proxy=ahachat-https-proxy \
  --global \
  --ports=443
```

## Option 2: Google Kubernetes Engine (GKE)

### 1. Create GKE Cluster

```bash
gcloud container clusters create ahachat-cluster \
  --region=$REGION \
  --num-nodes=3 \
  --machine-type=e2-standard-2 \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=10 \
  --enable-autorepair \
  --enable-autoupgrade
```

### 2. Deploy with Kubernetes Manifests

```bash
# Get cluster credentials
gcloud container clusters get-credentials ahachat-cluster --region=$REGION

# Apply Kubernetes manifests
kubectl apply -f k8s/
```

## Option 3: Compute Engine with Docker

### 1. Create VM Instance

```bash
gcloud compute instances create ahachat-vm \
  --zone=$REGION-a \
  --machine-type=e2-standard-4 \
  --image-family=debian-11 \
  --image-project=debian-cloud \
  --boot-disk-size=50GB \
  --tags=http-server,https-server
```

### 2. Install Docker and Deploy

```bash
# SSH into the instance
gcloud compute ssh ahachat-vm --zone=$REGION-a

# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose

# Clone your repository and deploy
git clone <your-repo>
cd aha.chat
docker-compose -f docker-compose.prod.yml up -d
```

## Environment Variables

### Required Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `MINIO_ENDPOINT`: S3-compatible storage endpoint
- `MINIO_ACCESS_KEY`: Storage access key
- `MINIO_SECRET_KEY`: Storage secret key
- `AUTH_SECRET`: Authentication secret
- `NODE_ENV`: Set to "production"

### Optional Variables

- `NEXT_PUBLIC_ASSET_URL`: Public asset URL
- `PARTYSOCKET_URL`: WebSocket server URL
- `NEXT_PUBLIC_BILLING_URL`: Billing service URL

## Monitoring and Logging

### Cloud Monitoring

```bash
# Enable monitoring
gcloud services enable monitoring.googleapis.com

# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

### Health Checks

All services include health check endpoints:
- Builder: `/api/health`
- Partysocket: `/health`
- Worker: Process monitoring

## Scaling

### Cloud Run Auto-scaling

- **Builder**: 0-1000 instances
- **Worker**: 1-100 instances (always running)
- **Partysocket**: 0-100 instances

### GKE Auto-scaling

```bash
# Enable cluster autoscaler
kubectl autoscale deployment ahachat-builder --min=2 --max=10 --cpu-percent=70
```

## Security

### IAM Roles

```bash
# Create service account for applications
gcloud iam service-accounts create ahachat-app \
  --display-name="AhaChat Application"

# Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ahachat-app@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

### Network Security

- Use VPC for private networking
- Configure firewall rules
- Enable Cloud Armor for DDoS protection

## Backup and Recovery

### Database Backups

```bash
# Enable automated backups
gcloud sql instances patch ahachat-postgres \
  --backup-start-time=02:00 \
  --backup-retention-days=7
```

### Storage Backups

```bash
# Create storage bucket versioning
gsutil versioning set on gs://ahachat-storage
```

## Cost Optimization

### Resource Sizing

- **Builder**: e2-standard-2 (2 vCPU, 8GB RAM)
- **Worker**: e2-standard-1 (1 vCPU, 4GB RAM)
- **Partysocket**: e2-standard-1 (1 vCPU, 4GB RAM)

### Reserved Instances

```bash
# Reserve instances for predictable workloads
gcloud compute reservations create ahachat-reservation \
  --machine-type=e2-standard-2 \
  --zone=$REGION-a \
  --vm-count=2
```

## Troubleshooting

### Common Issues

1. **Database Connection**: Check Cloud SQL proxy and firewall rules
2. **Redis Connection**: Verify Memorystore network configuration
3. **Storage Access**: Check IAM permissions for Cloud Storage
4. **Health Checks**: Verify endpoint accessibility and response format

### Debug Commands

```bash
# Check service status
gcloud run services list --region=$REGION

# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=ahachat-builder"

# Check database connectivity
gcloud sql connect ahachat-postgres --user=ahachatai
```

## Next Steps

1. Set up custom domain and SSL certificates
2. Configure CDN for static assets
3. Implement monitoring and alerting
4. Set up CI/CD pipeline
5. Configure backup and disaster recovery
6. Implement security scanning and compliance

For more detailed information, refer to the [Google Cloud documentation](https://cloud.google.com/docs).
