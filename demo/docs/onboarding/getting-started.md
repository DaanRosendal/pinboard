# Getting Started

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker

## Setup

```bash
git clone git@github.com:acme/platform.git
cd platform
make setup        # installs deps + starts docker services + runs migrations
make dev          # starts all apps and services
```

Visit [http://localhost:3000](http://localhost:3000) for the web app.
