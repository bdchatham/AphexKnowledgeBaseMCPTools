# syntax=docker/dockerfile:1
FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates jq unzip \
    && rm -rf /var/lib/apt/lists/*

# kubectl
RUN curl -fsSL "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
      -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl

# scip-typescript (global)
RUN npm install -g @sourcegraph/scip-typescript

# scip-go — pre-built linux/amd64 binary
ARG SCIP_GO_VERSION=v0.4.0
RUN curl -fsSL "https://github.com/sourcegraph/scip-go/releases/download/${SCIP_GO_VERSION}/scip-go_linux_amd64" \
      -o /usr/local/bin/scip-go && chmod +x /usr/local/bin/scip-go

# Go runtime (needed by scip-go to resolve modules)
COPY --from=golang:1.22-bookworm /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"

# Kiro CLI
RUN curl --proto '=https' --tlsv1.2 -sSf \
      'https://desktop-release.q.us-east-1.amazonaws.com/latest/kirocli-x86_64-linux.zip' \
      -o /tmp/kirocli.zip \
    && unzip /tmp/kirocli.zip -d /tmp/kirocli \
    && /tmp/kirocli/install.sh \
    && rm -rf /tmp/kirocli /tmp/kirocli.zip
ENV PATH="/root/.local/bin:${PATH}"

# MCP tools (built artifacts + production deps only)
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist/ dist/
COPY proto/ proto/

# Kiro MCP config — tells Kiro how to reach the local MCP server
RUN mkdir -p /root/.kiro/settings
COPY kiro-mcp.json /root/.kiro/settings/mcp.json

# CLI on PATH
RUN ln -s /app/dist/cli.js /usr/local/bin/aphex-kb && chmod +x /app/dist/cli.js

ENTRYPOINT []
