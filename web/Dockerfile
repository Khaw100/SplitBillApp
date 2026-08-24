# SplitBill v2 web — standalone Next.js with compiled Tailwind CSS
#
# Next 16 (both Turbopack & webpack) refuses to emit the Tailwind v4 CSS chunk
# in this container, even though the PostCSS plugin works when invoked
# directly. Root cause is inside Next's css pipeline; rather than fight it we
# compile globals.css ourselves with tailwindcss CLI and ship a plain <link>
# to the generated file. Zero runtime PostCSS needed.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
ARG API_INTERNAL_URL=http://api:8300
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1

# Compile Tailwind first (content scan covers ./app)
RUN npx @tailwindcss/cli -i app/globals.css -o public/tw.css --minify

RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3200
CMD ["node", "server.js"]
