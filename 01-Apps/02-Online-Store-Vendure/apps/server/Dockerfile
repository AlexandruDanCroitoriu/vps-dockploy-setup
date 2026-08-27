FROM node:22

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# This makes sure traffic is only sent to this container when its healthy (vendure started)
HEALTHCHECK --interval=1m --timeout=5s --start-interval=1s --start-period=20s --retries=3 CMD curl -f http://localhost:3000/health || exit 1
