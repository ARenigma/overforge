# Overforge backend — Core API & Orchestration. Multi-stage; runtime carries only
# the 5 prod deps + compiled dist + the Docker CLI client. Builds natively for the
# host arch (arm64 on beef).
FROM node:20-slim AS build
WORKDIR /app
COPY package.json tsconfig.json tsconfig.build.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Docker CLI client only (no daemon, no containerd) — the backend talks to the
# host daemon over the mounted socket to run candidate code in jailed containers.
ARG DOCKER_CLI_VERSION=27.5.1
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    case "$(dpkg --print-architecture)" in \
      amd64) dArch=x86_64 ;; \
      arm64) dArch=aarch64 ;; \
      *) echo "unsupported arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${dArch}/docker-${DOCKER_CLI_VERSION}.tgz" -o /tmp/d.tgz; \
    tar -xzf /tmp/d.tgz -C /usr/local/bin --strip-components=1 docker/docker; \
    rm /tmp/d.tgz; \
    apt-get purge -y curl; apt-get autoremove -y; rm -rf /var/lib/apt/lists/*; \
    docker --version

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 5001
USER node
CMD ["node", "dist/server.js"]
