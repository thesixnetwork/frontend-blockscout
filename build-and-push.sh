#!/bin/bash

# Build and Push Blockscout Frontend to GCP
# Builds using GCP Cloud Build (remote) to avoid local memory limitations.
# Layer caching is stored in Artifact Registry under the :buildcache tag,
# so unchanged stages (especially the heavy `deps` stage) are reused across builds.
# Usage: ./build-and-push.sh [VERSION]

set -e

# Configuration
PROJECT_ID="six-protocol"
REGION="asia-southeast1"
REPOSITORY="frontend-blockscout"
IMAGE_NAME="frontend"
VERSION=${1:-"latest"}

# Full image path
IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}"

echo "========================================="
echo "Building Blockscout Frontend (Cloud Build)"
echo "========================================="
echo "Project ID: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Repository: ${REPOSITORY}"
echo "Image: ${IMAGE_NAME}"
echo "Version: ${VERSION}"
echo "Full path: ${IMAGE_PATH}:${VERSION}"
echo "========================================="

# Get Git commit SHA and tag
GIT_COMMIT_SHA=$(git rev-parse --short HEAD)
# Use the VERSION argument as GIT_TAG so the in-app version matches the image tag
GIT_TAG=${VERSION}

echo "Git Commit: ${GIT_COMMIT_SHA}"
echo "Git Tag: ${GIT_TAG}"
echo ""

# Authenticate with GCP (only configures the local Docker credential helper;
# Cloud Build itself uses its service-account credentials in the cloud)
echo "Authenticating with GCP..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

echo ""
echo "Cache strategy:"
echo "  Pull  : ${IMAGE_PATH}:buildcache"
echo "  Push  : ${IMAGE_PATH}:buildcache (updated after every successful build)"
echo "  Effect: 'deps' stage (yarn install) is cached when yarn.lock is unchanged"
echo ""

BUILD_START=$(date +%s)

echo "Submitting build to GCP Cloud Build..."
echo "(This runs in the cloud – no local memory required)"
echo ""

gcloud builds submit \
  --project=${PROJECT_ID} \
  --region=${REGION} \
  --disk-size=100 \
  --timeout=3600 \
  --substitutions=_GIT_COMMIT_SHA=${GIT_COMMIT_SHA},_GIT_TAG=${GIT_TAG},_IMAGE_TAG=${IMAGE_PATH}:${VERSION} \
  --config=cloudbuild.yaml \
  .

BUILD_END=$(date +%s)
BUILD_DURATION=$(( BUILD_END - BUILD_START ))
BUILD_MINUTES=$(( BUILD_DURATION / 60 ))
BUILD_SECONDS=$(( BUILD_DURATION % 60 ))

echo ""
echo "========================================="
echo "✅ Successfully built and pushed images:"
echo "   - ${IMAGE_PATH}:${VERSION}"
echo "   - ${IMAGE_PATH}:${GIT_COMMIT_SHA}"
echo "   - ${IMAGE_PATH}:latest"
echo "   - ${IMAGE_PATH}:buildcache  (for next build)"
echo ""
echo "   Total build time: ${BUILD_MINUTES}m ${BUILD_SECONDS}s"
echo "========================================="
echo ""
echo "To use in production, update your frontend.yml:"
echo "  image: ${IMAGE_PATH}:${VERSION}"
echo ""

