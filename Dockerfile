# --- build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# prisma.config.ts reads DATABASE_URL; generate does not connect, so a
# placeholder is enough at build time. The real URL arrives at runtime.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN npm run build

# --- run ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV STORAGE_DIR=/app/storage/attachments
COPY --from=build /app /app
RUN mkdir -p /app/storage/attachments && chown -R node:node /app/storage
# Not root: a compromise of the app is not a compromise of the container.
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
