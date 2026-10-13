FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The repository also contains an optional Envio workspace whose lock entries
# are not needed by this standalone operator container.
RUN corepack enable && pnpm install --no-frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 8787

CMD ["pnpm", "operator:serve"]
