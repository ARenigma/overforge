# Overforge backend — Core API & Orchestration. Multi-stage; runtime carries only
# the 5 prod deps + compiled dist. Builds natively for the host arch (arm64 on beef).
FROM node:20-slim AS build
WORKDIR /app
COPY package.json tsconfig.json tsconfig.build.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 5001
USER node
CMD ["node", "dist/server.js"]
