FROM node:24 AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VENDURE_SHOP_API_URL=http://127.0.0.1:3000/shop-api
ENV VENDURE_SHOP_API_URL=$VENDURE_SHOP_API_URL
RUN npm run build

FROM node:24 AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
