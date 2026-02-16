# Quick Start: Deploy Blockscout Frontend to GCP Production

## 📋 Summary

**Yes, you're correct:**
- ✅ Docker images do NOT include `.env.local`
- ✅ You MUST configure `common-frontend.env` for production
- ✅ Your current setup using `env_file: ../envs/common-frontend.env` is correct

## 🚀 Quick Steps

### 1️⃣ Setup GCP (One-time)

```bash
# Set your GCP project
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast1"

# Create Artifact Registry repository
gcloud artifacts repositories create blockscout \
  --repository-format=docker \
  --location=${REGION} \
  --description="Blockscout images"

# Configure Docker authentication
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

### 2️⃣ Build and Push Image

```bash
cd /Users/sankanvicha/Desktop/project/sixscan-evm/blockscout-frontend

# Edit build-and-push.sh - Update these lines:
# PROJECT_ID="your-actual-project-id"
# REGION="asia-southeast1"

# Build and push
./build-and-push.sh v1.0.0
```

### 3️⃣ Update Production Server

**On your production VM (ubuntu@evm-scan-fivenet-001-os):**

```bash
# 1. Authenticate Docker with GCP
gcloud auth configure-docker asia-southeast1-docker.pkg.dev

# 2. Update frontend.yml
nano ~/blockscout/docker-compose/services/frontend.yml
```

Change this:
```yaml
services:
  frontend:
    image: ghcr.io/blockscout/frontend:v1.38.2
```

To this:
```yaml
services:
  frontend:
    image: asia-southeast1-docker.pkg.dev/your-project-id/blockscout/frontend:v1.0.0
```

```bash
# 3. Update common-frontend.env for production
nano ~/blockscout/docker-compose/envs/common-frontend.env

# Update these critical values:
# NEXT_PUBLIC_APP_PROTOCOL=https
# NEXT_PUBLIC_APP_HOST=your-actual-domain.com
# NEXT_PUBLIC_APP_ENV=production
# NEXT_PUBLIC_IS_TESTNET=false (if mainnet)
# NEXT_PUBLIC_NETWORK_RPC_URL=https://your-production-rpc-url.com

# 4. Pull and restart
cd ~/blockscout/docker-compose
docker-compose -f docker-compose.yml -f services/frontend.yml pull frontend
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend

# 5. Check logs
docker logs -f frontend
```

## 📁 Files Created

1. **`build-and-push.sh`** - Script to build and push to GCP
2. **`DEPLOYMENT_GCP.md`** - Complete deployment documentation
3. **`common-frontend.env.production.template`** - Production env template

## 🔑 Key Points

| Aspect | Development | Production |
|--------|-------------|------------|
| Config file | `.env.local` | `common-frontend.env` |
| Location | Local machine | Docker compose env_file |
| In Docker image? | ❌ No | ❌ No |
| How it's used | Next.js reads it | Docker mounts it at runtime |
| Environment | `development` | `production` |

## 🎯 Your Current Setup is CORRECT

Your `frontend.yml` is already configured correctly:
```yaml
env_file:
  - ../envs/common-frontend.env  # ✅ This is the right approach
```

The only thing you need to do is:
1. Build your custom image
2. Push it to GCP
3. Update the `image:` line to point to your GCP image
4. Ensure `common-frontend.env` has production values

## 🔐 Service Account for Production (Recommended)

Instead of using personal `gcloud auth login` on the server, use a service account:

```bash
# On your local machine
gcloud iam service-accounts create blockscout-puller \
  --display-name="Blockscout Image Puller"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:blockscout-puller@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"

gcloud iam service-accounts keys create key.json \
  --iam-account=blockscout-puller@YOUR_PROJECT_ID.iam.gserviceaccount.com

# Copy key.json to production server
scp key.json ubuntu@evm-scan-fivenet-001-os:~/

# On production server
gcloud auth activate-service-account --key-file=~/key.json
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
```

## 📞 Need Help?

Read the detailed guide: `DEPLOYMENT_GCP.md`
