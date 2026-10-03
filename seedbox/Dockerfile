# --- Build the React (shadcn/ui) frontend ---
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Runtime ---
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js cloud.js ./
COPY --from=web /app/public ./public
ENV DOWNLOAD_DIR=/data
EXPOSE 3000
CMD ["node", "server.js"]
