#!/bin/bash

# Build and Push Blockscout Frontend to GCP
# Builds using GCP Cloud Build (remote) to avoid local memory limitations.
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
GIT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v1.0.0")

echo "Git Commit: ${GIT_COMMIT_SHA}"
echo "Git Tag: ${GIT_TAG}"
echo ""

# Authenticate with GCP
echo "Authenticating with GCP..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push using GCP Cloud Build (no local memory limit)
echo ""
echo "Submitting build to GCP Cloud Build..."
echo "(This runs in the cloud - no local memory required)"
echo ""

gcloud builds submit \
  --project=${PROJECT_ID} \
  --region=${REGION} \
  --disk-size=100 \
  --timeout=3600 \
  --substitutions=_GIT_COMMIT_SHA=${GIT_COMMIT_SHA},_GIT_TAG=${GIT_TAG},_IMAGE_TAG=${IMAGE_PATH}:${VERSION} \
  --config=cloudbuild.yaml \
  .

echo ""
echo "========================================="
echo "✅ Successfully built and pushed images:"
echo "   - ${IMAGE_PATH}:${VERSION}"
echo "   - ${IMAGE_PATH}:${GIT_COMMIT_SHA}"
echo "   - ${IMAGE_PATH}:latest"
echo "========================================="
echo ""
echo "To use in production, update your frontend.yml:"
echo "  image: ${IMAGE_PATH}:${VERSION}"
echo ""
