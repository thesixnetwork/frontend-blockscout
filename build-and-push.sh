#!/bin/bash

# Build and Push Blockscout Frontend to GCP
# Usage: ./build-and-push.sh [VERSION]

set -e

# Configuration
PROJECT_ID="six-protocol"  # Replace with your GCP project ID
REGION="asia-southeast1"           # Replace with your preferred region
REPOSITORY="frontend-blockscout"            # Artifact Registry repository name
IMAGE_NAME="frontend"
VERSION=${1:-"latest"}

# Full image path
IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}"

echo "========================================="
echo "Building Blockscout Frontend"
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

# Build the Docker image
echo "Building Docker image..."
docker build \
  --platform linux/amd64 \
  --build-arg GIT_COMMIT_SHA=${GIT_COMMIT_SHA} \
  --build-arg GIT_TAG=${GIT_TAG} \
  --build-arg NEXT_OPEN_TELEMETRY_ENABLED=false \
  -t ${IMAGE_PATH}:${VERSION} \
  -t ${IMAGE_PATH}:${GIT_COMMIT_SHA} \
  -t ${IMAGE_PATH}:latest \
  -f Dockerfile \
  .

echo ""
echo "Build completed successfully!"
echo ""

# Authenticate with GCP (if not already authenticated)
echo "Authenticating with GCP..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Push the image
echo ""
echo "Pushing image to GCP Artifact Registry..."
docker push ${IMAGE_PATH}:${VERSION}
docker push ${IMAGE_PATH}:${GIT_COMMIT_SHA}
docker push ${IMAGE_PATH}:latest

echo ""
echo "========================================="
echo "✅ Successfully pushed images:"
echo "   - ${IMAGE_PATH}:${VERSION}"
echo "   - ${IMAGE_PATH}:${GIT_COMMIT_SHA}"
echo "   - ${IMAGE_PATH}:latest"
echo "========================================="
echo ""
echo "To use in production, update your frontend.yml:"
echo "  image: ${IMAGE_PATH}:${VERSION}"
echo ""
