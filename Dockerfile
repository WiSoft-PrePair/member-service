# Build
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN  pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec prisma generate

RUN pnpm run build

# Production

FROM node:24-alpine AS production

ENV NODE_ENV=prod

RUN corepack enable && corepack prepare pnpm@9.15.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

EXPOSE 7200

HEALTHCHECK --interval=24h --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7200/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

USER node

CMD ["node", "dist/main.js"]
