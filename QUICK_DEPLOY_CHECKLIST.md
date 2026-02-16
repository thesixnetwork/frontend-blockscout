# Quick Deployment Checklist ✅

## What We Fixed

**Problem:** `/api/rwa-note-proxy` was being intercepted by backend API instead of Next.js

**Solution:** Renamed route to `/api/rwa-note`

## Files Changed

- ✅ `pages/api/rwa-note-proxy.ts` → `pages/api/rwa-note.ts`
- ✅ `ui/token/RWANoteDisplay/RWANoteDisplay.tsx`
- ✅ `lib/metadata/getPageOgType.ts`
- ✅ `lib/metadata/templates/description.ts`
- ✅ `lib/metadata/templates/title.ts`
- ✅ `lib/mixpanel/getPageType.ts`
- ✅ `nextjs/nextjs-routes.d.ts`

## Deploy Steps (Once Build Passes)

### 1. Build and Push New Image

```bash
cd /Users/sankanvicha/Desktop/project/sixscan-evm/blockscout-frontend
./build-and-push.sh v1.0.1
```

### 2. Fix Production Environment (Remove Problematic Vars)

**SSH to server:**
```bash
ssh ubuntu@evm-scan-fivenet-001-os
```

**Edit config:**
```bash
nano ~/blockscout/docker-compose/envs/common-frontend.env
```

**Delete these two lines:**
```bash
NEXT_PUBLIC_HOMEPAGE_PLATE_BACKGROUND=...
NEXT_PUBLIC_HOMEPAGE_PLATE_TEXT_COLOR=...
```

**Save:** Ctrl+X, Y, Enter

### 3. Update Image Version

```bash
nano ~/blockscout/docker-compose/services/frontend.yml
```

**Change:**
```yaml
image: asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.1
```

### 4. Deploy

```bash
cd ~/blockscout/docker-compose
docker pull asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.1
docker-compose -f docker-compose.yml -f services/frontend.yml up -d frontend
docker logs -f frontend
```

### 5. Verify

**Wait for log:**
```
✅ Done.
🎉 All environment variables are valid
...
Listening on port 3000
```

**Test API:**
```bash
curl http://localhost:3000/api/rwa-note?endpoint=/health
```

**Test in browser:**
```
https://fivenet.evm.sixscan.io/api/rwa-note?endpoint=/rwa-notes/by-contract/0xea262379f6adAFB1B2f241321A42bDb47Bd7C614
```

**Expected:** JSON response or 404 (both are OK)

**NOT expected:** "module and action required" error

## Current Status

⏳ Waiting for `yarn build` to complete...

Once successful:
1. Run `./build-and-push.sh v1.0.1`
2. Follow steps 2-5 above
3. Test RWA Note feature in browser

## Key Changes Summary

| Before | After |
|--------|-------|
| `/api/rwa-note-proxy` | `/api/rwa-note` |
| Backend intercepts request | Next.js handles request |
| 400 "module/action required" | Proxies to RWA backend correctly |
