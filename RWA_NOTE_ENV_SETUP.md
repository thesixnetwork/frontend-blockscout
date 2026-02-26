# RWA Note Environment Configuration

## Problem
The Docker container deployment was failing with the error:
```
🚨 Congruity check failed.
Error: For the following environment variables placeholders were not generated at build-time:
     NEXT_PUBLIC_RWA_NOTE_CONTRACT_ADDRESS
   They are either deprecated or running the app with them may lead to unexpected behavior.
```

This occurred because `NEXT_PUBLIC_RWA_NOTE_CONTRACT_ADDRESS` was a custom environment variable that wasn't registered in Blockscout's environment validation schema.

## Solution

We have registered the `NEXT_PUBLIC_RWA_NOTE_CONTRACT_ADDRESS` environment variable in the Blockscout validation system so it can be used in production without errors.

### Changes Made

#### 1. Updated Environment Validation Schema
**File:** `deploy/tools/envs-validator/schema.ts`

Added the variable to the Yup schema:
```typescript
NEXT_PUBLIC_RWA_NOTE_CONTRACT_ADDRESS: yup.string(),
```

#### 2. Updated CreateRWANoteModal Component
**File:** `ui/token/CreateRWANoteButton/CreateRWANoteModal.tsx`

Changed from hardcoded address:
```typescript
const RWA_NOTE_CONTRACT_ADDRESS = '0x01824B8F5cC22Cab69B611C2b9Dee53494C368c6';
```

To environment variable with fallback:
```typescript
const RWA_NOTE_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_RWA_NOTE_CONTRACT_ADDRESS || '0x2A0f976Ad09e8389Aaf687709f81369fb93E4f9a';
```

#### 3. Added Documentation
**File:** `docs/ENVS.md`

- Added entry to table of contents
- Created "RWA Note Smart Contract" section documenting the environment variable

## Usage in Production

### Environment File
Add to your `docker-compose/envs/common-frontend.env`:

```bash
NEXT_PUBLIC_RWA_NOTE_CONTRACT_ADDRESS=0x2A0f976Ad09e8389Aaf687709f81369fb93E4f9a
```

### Docker Compose
Your `frontend.yml` should include:
```yaml
services:
  frontend:
    image: asia-southeast1-docker.pkg.dev/six-protocol/frontend-blockscout/frontend:v1.0.2
    env_file:
      - ../envs/common-frontend.env
```

## Testing
After deployment, the container startup should no longer show the congruity check error, and the RWA Note feature will use the configured contract address from the environment variable.

## Backward Compatibility
The code includes a fallback to the hardcoded address if the environment variable is not set, ensuring backward compatibility with existing deployments.
