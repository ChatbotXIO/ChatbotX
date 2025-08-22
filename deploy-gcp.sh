#!/bin/bash

# AhaChat GCP Deployment Script
# This script automates the deployment of your AhaChat application to Google Cloud Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${PROJECT_ID:-""}
REGION=${REGION:-"us-central1"}
ENVIRONMENT=${ENVIRONMENT:-"production"}

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        print_error "Google Cloud SDK is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install it first."
        exit 1
    fi
    
    print_status "Prerequisites check passed!"
}

# Function to set up GCP project
setup_gcp_project() {
    if [ -z "$PROJECT_ID" ]; then
        print_error "PROJECT_ID environment variable is not set."
        print_status "Please set it: export PROJECT_ID='your-project-id'"
        exit 1
    fi
    
    print_status "Setting up GCP project: $PROJECT_ID"
    
    # Set project
    gcloud config set project $PROJECT_ID
    
    # Set region
    gcloud config set run/region $REGION
    
    # Enable required APIs
    print_status "Enabling required APIs..."
    gcloud services enable \
        run.googleapis.com \
        sql-component.googleapis.com \
        sqladmin.googleapis.com \
        redis.googleapis.com \
        storage.googleapis.com \
        cloudbuild.googleapis.com \
        containerregistry.googleapis.com \
        monitoring.googleapis.com
    
    print_status "GCP project setup completed!"
}

# Function to create infrastructure
create_infrastructure() {
    print_status "Creating infrastructure..."
    
    # Create Cloud SQL instance
    print_status "Creating Cloud SQL instance..."
    gcloud sql instances create ahachat-postgres \
        --database-version=POSTGRES_16 \
        --tier=db-f1-micro \
        --region=$REGION \
        --storage-type=SSD \
        --storage-size=10GB \
        --backup-start-time=02:00 \
        --maintenance-window-day=SUN \
        --maintenance-window-hour=02 \
        --quiet || print_warning "Cloud SQL instance already exists or failed to create"
    
    # Create database
    print_status "Creating database..."
    gcloud sql databases create ahachatai --instance=ahachat-postgres --quiet || print_warning "Database already exists"
    
    # Create user (you'll need to set POSTGRES_PASSWORD)
    if [ -n "$POSTGRES_PASSWORD" ]; then
        print_status "Creating database user..."
        gcloud sql users create ahachatai \
            --instance=ahachat-postgres \
            --password="$POSTGRES_PASSWORD" \
            --quiet || print_warning "User already exists"
    else
        print_warning "POSTGRES_PASSWORD not set, skipping user creation"
    fi
    
    # Create Memorystore instance
    print_status "Creating Memorystore instance..."
    gcloud redis instances create ahachat-redis \
        --size=1 \
        --region=$REGION \
        --redis-version=redis_7_0 \
        --quiet || print_warning "Memorystore instance already exists or failed to create"
    
    # Create Cloud Storage bucket
    print_status "Creating Cloud Storage bucket..."
    gsutil mb -l $REGION gs://ahachat-storage 2>/dev/null || print_warning "Storage bucket already exists"
    gsutil iam ch allUsers:objectViewer gs://ahachat-storage
    
    print_status "Infrastructure creation completed!"
}

# Function to build and push Docker images
build_and_push_images() {
    print_status "Building and pushing Docker images..."
    
    # Build images
    print_status "Building Docker images..."
    docker-compose -f docker-compose.prod.yml build
    
    # Tag images
    print_status "Tagging images for Google Container Registry..."
    docker tag ahachatai-prod-builder:latest gcr.io/$PROJECT_ID/ahachat-builder:latest
    docker tag ahachatai-prod-worker:latest gcr.io/$PROJECT_ID/ahachat-worker:latest
    docker tag ahachatai-prod-partysocket:latest gcr.io/$PROJECT_ID/ahachat-partysocket:latest
    
    # Push images
    print_status "Pushing images to Google Container Registry..."
    docker push gcr.io/$PROJECT_ID/ahachat-builder:latest
    docker push gcr.io/$PROJECT_ID/ahachat-worker:latest
    docker push gcr.io/$PROJECT_ID/ahachat-partysocket:latest
    
    print_status "Docker images built and pushed successfully!"
}

# Function to deploy to Cloud Run
deploy_to_cloud_run() {
    print_status "Deploying to Cloud Run..."
    
    # Get Redis IP
    REDIS_IP=$(gcloud redis instances describe ahachat-redis --region=$REGION --format="value(host)" 2>/dev/null || echo "localhost")
    
    # Deploy Builder
    print_status "Deploying Builder (Next.js)..."
    gcloud run deploy ahachat-builder \
        --image gcr.io/$PROJECT_ID/ahachat-builder:latest \
        --platform managed \
        --region $REGION \
        --allow-unauthenticated \
        --port 3000 \
        --memory 2Gi \
        --cpu 2 \
        --set-env-vars="NODE_ENV=production,REDIS_URL=redis://$REDIS_IP:6379,MINIO_ENDPOINT=https://storage.googleapis.com,MINIO_ACCESS_KEY=ahachatai,MINIO_SECRET_KEY=$MINIO_ROOT_PASSWORD" \
        --add-cloudsql-instances $PROJECT_ID:$REGION:ahachat-postgres \
        --quiet
    
    # Deploy Worker
    print_status "Deploying Worker..."
    gcloud run deploy ahachat-worker \
        --image gcr.io/$PROJECT_ID/ahachat-worker:latest \
        --platform managed \
        --region $REGION \
        --no-allow-unauthenticated \
        --port 3000 \
        --memory 1Gi \
        --cpu 1 \
        --set-env-vars="NODE_ENV=production,REDIS_URL=redis://$REDIS_IP:6379,MINIO_ENDPOINT=https://storage.googleapis.com,MINIO_ACCESS_KEY=ahachatai,MINIO_SECRET_KEY=$MINIO_ROOT_PASSWORD" \
        --add-cloudsql-instances $PROJECT_ID:$REGION:ahachat-postgres \
        --quiet
    
    # Deploy Partysocket
    print_status "Deploying Partysocket..."
    gcloud run deploy ahachat-partysocket \
        --image gcr.io/$PROJECT_ID/ahachat-partysocket:latest \
        --platform managed \
        --region $REGION \
        --allow-unauthenticated \
        --port 1999 \
        --memory 1Gi \
        --cpu 1 \
        --set-env-vars="NODE_ENV=production,REDIS_URL=redis://$REDIS_IP:6379,MINIO_ENDPOINT=https://storage.googleapis.com,MINIO_ACCESS_KEY=ahachatai,MINIO_SECRET_KEY=$MINIO_ROOT_PASSWORD" \
        --add-cloudsql-instances $PROJECT_ID:$REGION:ahachat-postgres \
        --quiet
    
    print_status "Cloud Run deployment completed!"
}

# Function to display deployment information
show_deployment_info() {
    print_status "Deployment completed successfully!"
    echo
    echo "=== Deployment Information ==="
    echo "Project ID: $PROJECT_ID"
    echo "Region: $REGION"
    echo "Environment: $ENVIRONMENT"
    echo
    echo "=== Service URLs ==="
    
    # Get service URLs
    BUILDER_URL=$(gcloud run services describe ahachat-builder --region=$REGION --format="value(status.url)" 2>/dev/null || echo "Not available")
    WORKER_URL=$(gcloud run services describe ahachat-worker --region=$REGION --format="value(status.url)" 2>/dev/null || echo "Not available")
    PARTYSOCKET_URL=$(gcloud run services describe ahachat-partysocket --region=$REGION --format="value(status.url)" 2>/dev/null || echo "Not available")
    
    echo "Builder: $BUILDER_URL"
    echo "Worker: $WORKER_URL"
    echo "Partysocket: $PARTYSOCKET_URL"
    echo
    echo "=== Next Steps ==="
    echo "1. Update your environment variables with the service URLs"
    echo "2. Configure your database connection string"
    echo "3. Set up custom domains and SSL certificates"
    echo "4. Configure monitoring and alerting"
    echo
    echo "For more information, see DEPLOYMENT.md"
}

# Main execution
main() {
    echo "🚀 AhaChat GCP Deployment Script"
    echo "================================="
    echo
    
    check_prerequisites
    setup_gcp_project
    create_infrastructure
    build_and_push_images
    deploy_to_cloud_run
    show_deployment_info
}

# Check if script is being sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
