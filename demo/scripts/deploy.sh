#!/usr/bin/env bash
set -euo pipefail

ENV="${1:-staging}"
IMAGE_TAG="${2:-latest}"

echo "Deploying to $ENV (image: $IMAGE_TAG)..."

docker build -t acme-backend:$IMAGE_TAG ./packages/backend
docker push registry.acme.example.com/backend:$IMAGE_TAG

echo "Deployment to $ENV complete."
