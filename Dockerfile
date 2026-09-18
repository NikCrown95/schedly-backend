# --- Stage 1: dependencies + build ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: production dependencies only ---
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev
RUN npx prisma generate

# --- Stage 3: runtime ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system schedly && useradd --system --gid schedly --create-home schedly

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY package*.json ./

USER schedly
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
