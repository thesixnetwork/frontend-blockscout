# Build & Deploy Checklist ✅

## ✅ COMPLETED
- [x] Fixed ESLint errors in proxy files
- [x] Added `/api/rwa-note-proxy` route to all metadata files:
  - [x] `lib/metadata/getPageOgType.ts`
  - [x] `lib/metadata/templates/description.ts`
  - [x] `lib/metadata/templates/title.ts`
  - [x] `lib/mixpanel/getPageType.ts`
- [x] Local build test: **PASSED** ✅

## 🔄 IN PROGRESS
- [ ] Docker build test (running in background)

## 📋 TODO - After Docker Build Succeeds

### 1. Push Image to GCP Artifact Registry

```bash
# Make sure you're in the blockscout-frontend directory
cd /Users/sankanvicha/Desktop/project/sixscan-evm/blockscout-frontend

# Run the build and push script
./build-and-push.sh v1.0.0
```

### 2. Update Production Server

**SSH to your production server:**
```bash
ssh ubuntu@evm-scan-fivenet-001-os
```

**Authenticate Docker with GCP:**
```bash
# Using service account (recommended)
gcloud auth activate-service-account --key-file=~/key.json
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
```

**Update `frontend.yml`:**
```bash
cd ~/blockscout/docker-compose/services
nano frontend.yml
```

Change:
```yaml
image: ghcr.io/blockscout/frontend:v1.38.2
```

To:
```yaml
image: asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.0
```

**Verify `common-frontend.env` has production values:**
```bash
cd ~/blockscout/docker-compose/envs
nano common-frontend.env
```

Make sure these are set correctly:
```env
NEXT_PUBLIC_APP_PROTOCOL=https
NEXT_PUBLIC_APP_HOST=your-production-domain.com
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_IS_TESTNET=false  # or true for testnet
NEXT_PUBLIC_NETWORK_RPC_URL=https://your-production-rpc-url.com
```

**Pull and restart:**
```bash
cd ~/blockscout/docker-compose

# Pull the new image
docker-compose -f docker-compose.yml -f services/frontend.yml pull frontend

# Restart the frontend service
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend

# Check logs
docker logs -f frontend
```

### 3. Verify Deployment

**Check the frontend is running:**
```bash
# Check container status
docker ps | grep frontend

# Check logs for errors
docker logs frontend --tail 100

# Test the RWA note proxy endpoint
curl http://localhost:3000/api/rwa-note-proxy?endpoint=/health
```

**Access from browser:**
- Visit your domain: `https://your-production-domain.com`
- Check if the frontend loads correctly
- Test RWA note functionality

## 🔍 Monitoring

**Watch logs in real-time:**
```bash
docker logs -f frontend
```

**Check container health:**
```bash
docker inspect frontend | grep -A 10 Health
```

**Restart if needed:**
```bash
docker-compose -f docker-compose.yml -f services/frontend.yml restart frontend
```

## 🐛 Troubleshooting

### Image pull fails
```bash
# Re-authenticate
gcloud auth configure-docker asia-southeast1-docker.pkg.dev

# Or check service account permissions
gcloud projects get-iam-policy six-protocol \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:*"
```

### Container won't start
```bash
# Check logs
docker logs frontend

# Check environment variables are loaded
docker exec frontend env | grep NEXT_PUBLIC
```

### Old version still showing
```bash
# Force remove old image and pull fresh
docker-compose -f docker-compose.yml -f services/frontend.yml down
docker rmi asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.0
docker-compose -f docker-compose.yml -f services/frontend.yml pull frontend
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend
```

## 📝 Notes

- Always test in a staging environment first if available
- Keep track of which version is deployed where
- Tag your git commits when deploying: `git tag v1.0.0 && git push origin v1.0.0`
- The build process takes ~15-30 minutes for Docker build
- Image size will be ~500MB-1GB

## 🔄 Future Deployments

For subsequent deployments:

```bash
# 1. Make your code changes
# 2. Test locally
yarn build

# 3. Build and push new version
./build-and-push.sh v1.0.1

# 4. Update production
ssh ubuntu@evm-scan-fivenet-001-os
cd ~/blockscout/docker-compose
docker-compose -f docker-compose.yml -f services/frontend.yml pull frontend
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend
```
