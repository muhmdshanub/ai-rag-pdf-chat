# ---- Stage 1: Base ----
FROM node:18-alpine AS base

WORKDIR /app

COPY package*.json ./

# ---- Stage 2: Development ----
FROM base AS development

RUN npm install

COPY . .

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 5000

CMD ["npx", "nodemon", "--watch", "src", "src/server.js"]

# ---- Stage 3: Production ----
FROM base AS production

RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "src/server.js"]
