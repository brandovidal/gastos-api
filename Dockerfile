# kogane-api for Railway (P10, D52). Build: docker build -t kogane-api .
FROM node:22-slim AS base
# husky needs .git (absent in the image); corepack installs the pnpm pinned in package.json
ENV HUSKY=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
# postinstall runs `prisma generate`, which needs the schema
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
# Railway sets PORT; migrations and seed run in the deploy workflow before this image goes live
CMD ["node", "dist/main"]
