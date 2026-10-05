# Build from the repository root:  docker build -f server/Dockerfile -t smm-pro-api .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root
COPY server server
RUN npm run build --workspace server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist server/dist
WORKDIR /app/server
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
