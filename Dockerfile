# Stage 1: Build and dependency installation
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies (including devDependencies for testing and migration runs)
RUN npm ci

COPY . .

# Stage 2: Production runtime image
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./

# Install production-only dependencies
RUN npm ci --only=production

# Copy source and migrations
COPY src/ ./src
COPY migrations/ ./migrations
COPY swagger.json ./swagger.json

# Create uploads directory and change ownership to build-in non-root node user
RUN mkdir -p uploads && chown -R node:node /usr/src/app

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
