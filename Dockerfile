# Build stage
FROM node:20-alpine AS builder

WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Run stage
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /src/.output ./.output

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
