# Complete Deployment Steps - RWA Note Feature

## Changes Made

### 1. API Route Rename
- **Old:** `/api/rwa-note-proxy`
- **New:** `/api/rwa-note`
- **Reason:** Avoid conflict with backend API routing that intercepts `/api/*` requests

### 2. Files Changed
- ✅ `pages/api/rwa-note-proxy.ts` → `pages/api/rwa-note.ts`
- ✅ `ui/token/RWANoteDisplay/RWANoteDisplay.tsx` - Updated fetch URL
- ✅ `lib/metadata/getPageOgType.ts` - Updated route mapping
- ✅ `lib/metadata/templates/description.ts` - Updated route mapping
- ✅ `lib/metadata/templates/title.ts` - Updated route mapping
- ✅ `lib/mixpanel/getPageType.ts` - Updated route mapping

## Next Steps

### Step 1: Test Local Build

```bash
cd /Users/sankanvicha/Desktop/project/sixscan-evm/blockscout-frontend
yarn build
```

If successful, proceed to Step 2.

### Step 2: Build and Push New Docker Image

```bash
./build-and-push.sh v1.0.1
```

This will:
- Build the Docker image with the new API route
- Push to GCP Artifact Registry as v1.0.1

### Step 3: Fix Production Environment Variables

**On production server:**

```bash
# Edit common-frontend.env
nano ~/blockscout/docker-compose/envs/common-frontend.env
```

**Remove these two lines:**
```bash
NEXT_PUBLIC_HOMEPAGE_PLATE_BACKGROUND=linear-gradient(271.05deg, rgb(51, 51, 126) 0%, rgb(70, 75, 146) 43.59%, rgb(124, 92, 206) 100%)
NEXT_PUBLIC_HOMEPAGE_PLATE_TEXT_COLOR=rgba(255, 255, 255, 1)
```

Save the file.

### Step 4: Update Frontend Image Version

**Edit frontend.yml:**

```bash
nano ~/blockscout/docker-compose/services/frontend.yml
```

Change:
```yaml
image: asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.0
```

To:
```yaml
image: asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.1
```

### Step 5: Deploy

```bash
cd ~/blockscout/docker-compose

# Pull new image
docker pull asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.1

# Restart frontend
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend

# Watch logs
docker logs -f frontend
```

### Step 6: Verify Deployment

**Wait for frontend to start (should see):**
```
✅ Done.
🎉 All environment variables are valid.
...
Listening on port 3000
```

**Test the API endpoint:**

```bash
# From production server
curl http://localhost:3000/api/rwa-note?endpoint=/rwa-notes/by-contract/0xea262379f6adAFB1B2f241321A42bDb47Bd7C614

# From your browser
https://fivenet.evm.sixscan.io/api/rwa-note?endpoint=/rwa-notes/by-contract/0xea262379f6adAFB1B2f241321A42bDb47Bd7C614
```

**Expected response:**
```json
{
  "_id": "...",
  "contractAddress": "0xea262379f6adAFB1B2f241321A42bDb47Bd7C614",
  "contractOwnerAddress": "...",
  "note": "Your RWA note content",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Or `404` if no note exists (which is fine).

### Step 7: Test in Browser

1. Navigate to a token page: `https://fivenet.evm.sixscan.io/token/0xea262379f6adAFB1B2f241321A42bDb47Bd7C614`
2. The RWA Note should appear below the token info if it exists
3. Check browser console for any errors

## Troubleshooting

### Frontend won't start
```bash
# Check logs
docker logs frontend --tail 100

# If environment variable errors, remove problematic vars from common-frontend.env
```

### 502 Bad Gateway
```bash
# Check if frontend is running
docker ps | grep frontend

# Check if it's listening on port 3000
curl http://localhost:3000
```

### API returns 400 "module and action required"
- This means the request is still being routed to the backend
- The new `/api/rwa-note` route should fix this
- Make sure you deployed v1.0.1 with the renamed route

### RWA Note doesn't appear
- Open browser DevTools → Network tab
- Look for the API request
- Check the response
- If 404, the note doesn't exist (normal)
- If other error, check the response details

## Rollback Plan

If something goes wrong:

```bash
# Revert to v1.0.0
nano ~/blockscout/docker-compose/services/frontend.yml
# Change back to: image: ...frontend:v1.0.0

# Restart
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend
```

## Summary

The issue was that `/api/*` routes were being intercepted by the nginx/backend routing before reaching the Next.js API handlers. By renaming to `/api/rwa-note` and rebuilding, the route should work correctly.

The environment variable errors (`HOMEPAGE_PLATE_*`) are unrelated to the API routing and can be fixed by removing those variables from production config.
