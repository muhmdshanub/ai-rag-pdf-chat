# ---- Stage 1: Base ----
FROM node:20-slim AS base

WORKDIR /app

COPY package*.json ./

# ---- Stage 2: Development ----
FROM base AS development

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- Stage 3: Production ----
FROM base AS production

RUN npm ci

COPY . .

RUN npm run build

# Serve with nginx
FROM nginx:alpine AS nginx

COPY --from=production /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
