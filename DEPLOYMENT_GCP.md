# Blockscout Frontend - GCP Deployment Guide

## Prerequisites

1. **GCP Project Setup**
   - Create or use existing GCP project
   - Enable Artifact Registry API
   - Enable Container Registry API (if using GCR)

2. **Local Requirements**
   - Docker installed
   - gcloud CLI installed and authenticated
   - Git repository initialized

## Setup GCP Artifact Registry

### Option 1: Using Artifact Registry (Recommended)

```bash
# Set your project
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast1"  # or your preferred region

# Set the project
gcloud config set project ${PROJECT_ID}

# Create Artifact Registry repository (if not exists)
gcloud artifacts repositories create blockscout \
  --repository-format=docker \
  --location=${REGION} \
  --description="Blockscout container images"

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

### Option 2: Using Container Registry (Legacy)

```bash
# Configure Docker authentication
gcloud auth configure-docker gcr.io

# Image will be: gcr.io/${PROJECT_ID}/frontend:${VERSION}
```

## Build and Push Image

### 1. Update the build script

Edit `build-and-push.sh` and set your values:

```bash
PROJECT_ID="your-actual-project-id"
REGION="asia-southeast1"
REPOSITORY="blockscout"
```

### 2. Make the script executable

```bash
chmod +x build-and-push.sh
```

### 3. Build and push

```bash
# Push with specific version
./build-and-push.sh v1.0.0

# Or push with 'latest' tag
./build-and-push.sh latest
```

## Production Deployment

### 1. Update your `frontend.yml` on production server

Replace the image in your `docker-compose/services/frontend.yml`:

```yaml
version: '3.9'

services:
  frontend:
    # Replace this with your GCP image
    image: asia-southeast1-docker.pkg.dev/your-project-id/blockscout/frontend:v1.0.0
    # Or use latest
    # image: asia-southeast1-docker.pkg.dev/your-project-id/blockscout/frontend:latest
    pull_policy: always
    platform: linux/amd64
    restart: always
    container_name: 'frontend'
    env_file:
      - ../envs/common-frontend.env
    ports:
      - "3000:3000"
    networks:
      - blockscout-network
```

### 2. Configure `common-frontend.env` for Production

Your environment file should have production values:

```env
# App Settings
NEXT_PUBLIC_APP_PROTOCOL=https
NEXT_PUBLIC_APP_HOST=your-domain.com
NEXT_PUBLIC_APP_PORT=443
NEXT_PUBLIC_APP_ENV=production

# API Settings
NEXT_PUBLIC_API_HOST=backend
NEXT_PUBLIC_API_PORT=4000
NEXT_PUBLIC_API_PROTOCOL=http
NEXT_PUBLIC_API_BASE_PATH=/

# Network Settings
NEXT_PUBLIC_NETWORK_NAME=Your Production Network
NEXT_PUBLIC_NETWORK_ID=150
NEXT_PUBLIC_NETWORK_RPC_URL=https://your-rpc-url.com
NEXT_PUBLIC_IS_TESTNET=false

# Other settings...
```

### 3. Authenticate GCP on Production Server

On your Ubuntu server:

```bash
# Install gcloud CLI if not installed
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Initialize and authenticate
gcloud init
gcloud auth login

# Configure Docker to use GCP
gcloud auth configure-docker asia-southeast1-docker.pkg.dev

# Or create a service account key (recommended for servers)
gcloud iam service-accounts create blockscout-puller \
  --display-name="Blockscout Image Puller"

gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:blockscout-puller@your-project-id.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"

gcloud iam service-accounts keys create ~/key.json \
  --iam-account=blockscout-puller@your-project-id.iam.gserviceaccount.com

# Authenticate using service account
gcloud auth activate-service-account --key-file=~/key.json
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
```

### 4. Pull and Run

```bash
cd ~/blockscout/docker-compose

# Pull the new image
docker pull asia-southeast1-docker.pkg.dev/your-project-id/blockscout/frontend:v1.0.0

# Restart the service
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend

# Check logs
docker logs -f frontend
```

## Environment Variables Priority

The Dockerfile handles environment variables in this order:

1. **Build-time args** (in Dockerfile) - for git info only
2. **Runtime ENV file** (`common-frontend.env`) - **This is what you use in production**
3. **Container environment** - Can override via docker-compose environment section

### Important Notes:

✅ **DO NOT** include `.env.local` in Docker images
✅ **DO** use `common-frontend.env` for all runtime configuration
✅ **DO** keep sensitive values in environment files, not in the image
✅ The entrypoint script validates environment variables on startup

## CI/CD Integration (Optional)

### GitHub Actions Example

```yaml
name: Build and Push to GCP

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
      
      - name: Configure Docker
        run: gcloud auth configure-docker asia-southeast1-docker.pkg.dev
      
      - name: Build and Push
        run: |
          cd blockscout-frontend
          ./build-and-push.sh ${GITHUB_REF#refs/tags/}
```

## Troubleshooting

### Image pull authentication issues
```bash
# Re-authenticate
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
docker logout asia-southeast1-docker.pkg.dev
docker login -u _json_key --password-stdin https://asia-southeast1-docker.pkg.dev < ~/key.json
```

### Permission denied
```bash
# Ensure service account has correct roles
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SA_NAME@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"
```

### Check image exists
```bash
gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/PROJECT_ID/blockscout
```

## Cleanup Old Images

```bash
# List all images
gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/your-project-id/blockscout/frontend

# Delete specific version
gcloud artifacts docker images delete \
  asia-southeast1-docker.pkg.dev/your-project-id/blockscout/frontend:v1.0.0
```
