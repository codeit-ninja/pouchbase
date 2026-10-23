# Pouchbase as a Node server. The data lives on Cloudflare (D1 and R2), so the container needs the
# Cloudflare credentials; it keeps no state of its own.
#
#   docker build -t pouchbase .
#   docker run -p 3000:3000 -e ORIGIN=http://localhost:3000 \
#     -e CLOUDFLARE_ACCOUNT_ID=... -e CLOUDFLARE_API_TOKEN=... pouchbase
#
# The container runs `server.mjs`, see that file for the environment variables.

# The build stages run on the native platform of the builder (no emulation for arm64): their output
# is plain JavaScript, and the production dependencies are pure JavaScript and WebAssembly.
FROM --platform=$BUILDPLATFORM node:26-alpine AS base
WORKDIR /app
# Node 25 and later no longer ship Corepack: install the pnpm version from `packageManager`.
COPY package.json ./
RUN npm install -g "$(node -p "require('./package.json').packageManager")"

# Install all dependencies and build the Node target.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
ENV POUCHBASE_TARGET=node
RUN pnpm build:node

# Production dependencies only: the server-side packages in `dependencies`. Everything in
# `devDependencies` (UI libraries and the plugin SDK included) is bundled into the build by
# adapter-node. Only the app itself: the plugin SDK's own dependencies (its CLI) aren't needed.
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter pouchbase

FROM node:26-alpine AS runner
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=16M
WORKDIR /app
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/build ./build
COPY --chown=node:node package.json server.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.mjs"]
