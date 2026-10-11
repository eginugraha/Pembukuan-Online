FROM oven/bun:1.3.10 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bunx svelte-kit sync && bun run build

FROM oven/bun:1.3.10
WORKDIR /app
ENV NODE_ENV=production PORT=3000 BODY_SIZE_LIMIT=11M IDLE_TIMEOUT=120
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/seeds ./seeds
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["sh", "-c", "bun run src/lib/server/db/migrate.ts && exec bun ./build/index.js"]
