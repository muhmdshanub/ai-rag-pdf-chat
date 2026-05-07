# 🐳 Docker Containers & Infrastructure Setup Guide

## Docker Containers Overview

### Development Environment (docker-compose)

You'll run **4 containers** locally:

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. PostgreSQL + pgvector                                   │
│     ├─ Image: pgvector/pgvector:pg15-latest               │
│     ├─ Port: 5432:5432                                     │
│     ├─ Volume: postgres_data (persists data)               │
│     └─ Purpose: Vector DB + Relational data                │
│                                                              │
│  2. Redis                                                   │
│     ├─ Image: redis:7-alpine                               │
│     ├─ Port: 6379:6379                                     │
│     ├─ Purpose: Cache + Bull job queue                     │
│     └─ No volume (temp, resets on restart)                 │
│                                                              │
│  3. Backend (Express.js)                                    │
│     ├─ Build: ./backend/Dockerfile                         │
│     ├─ Port: 5000:5000                                     │
│     ├─ Depends on: PostgreSQL + Redis                      │
│     └─ Purpose: API server                                 │
│                                                              │
│  4. Frontend (React)                                        │
│     ├─ Build: ./frontend/Dockerfile                        │
│     ├─ Port: 3000:3000                                     │
│     ├─ Depends on: Backend                                 │
│     └─ Purpose: Web UI                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## docker-compose.yml Setup

```yaml
version: '3.8'

services:
  # ==================== DATABASE ====================
  postgres:
    image: pgvector/pgvector:pg15-latest
    container_name: rag_chat_postgres
    environment:
      POSTGRES_DB: rag_chat
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - rag_network

  # ==================== CACHE & QUEUE ====================
  redis:
    image: redis:7-alpine
    container_name: rag_chat_redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - rag_network
    # Optional: persist Redis data (for production)
    # volumes:
    #   - redis_data:/data

  # ==================== BACKEND ====================
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: rag_chat_backend
    ports:
      - "5000:5000"
    environment:
      DATABASE_URL: postgresql://dev:dev123@postgres:5432/rag_chat
      REDIS_URL: redis://redis:6379
      GROQ_API_KEY: ${GROQ_API_KEY}
      HUGGINGFACE_API_KEY: ${HUGGINGFACE_API_KEY}
      NODE_ENV: development
      PORT: 5000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - /app/node_modules
    networks:
      - rag_network

  # ==================== FRONTEND ====================
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: rag_chat_frontend
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:5000
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules
    networks:
      - rag_network

volumes:
  postgres_data:
  # redis_data:  # Optional

networks:
  rag_network:
    driver: bridge
```

---

## Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "src/server.js"]
```

---

## Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Configure nginx to serve React app
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
```

---

## nginx.conf (for frontend)

```nginx
server {
    listen 3000;
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
    location /api {
        proxy_pass http://backend:5000;
    }
}
```

---

## Production Deployment (Railway/Render)

### Separate Services Architecture

In **production**, you'll deploy **separate services** (not all in one docker-compose):

```
┌─────────────────────────────────────────────────────┐
│         Railway/Render Dashboard                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Service 1: Backend (Node.js)                       │
│  ├─ Deploy from: ./backend/Dockerfile               │
│  ├─ Auto-scales with traffic                        │
│  ├─ Connected to managed PostgreSQL                 │
│  └─ Connected to managed Redis                      │
│                                                      │
│  Service 2: Frontend (Static + CDN)                 │
│  ├─ Deploy from: ./frontend/Dockerfile              │
│  ├─ Or: Vercel/Netlify (separate)                   │
│  ├─ CDN for fast delivery                           │
│  └─ Points to backend service                       │
│                                                      │
│  Service 3: PostgreSQL (Managed)                    │
│  ├─ Railway provides managed database               │
│  ├─ Auto backups                                    │
│  ├─ pgvector extension included                     │
│  └─ Scales independently                            │
│                                                      │
│  Service 4: Redis (Managed)                         │
│  ├─ Railway provides managed Redis                  │
│  ├─ Persistent storage option                       │
│  └─ Auto-restarts                                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Container Network Communication

### Local Development (docker-compose)

Containers communicate via container names:

```
Frontend → http://backend:5000/api
Backend  → postgresql://postgres:5432/rag_chat
Backend  → redis://redis:6379
```

### Production (Railway)

Services communicate via private network URLs:

```
Frontend → https://backend-service-xyz.railway.app/api
Backend  → postgresql://db.railway.app:5432/rag_chat
Backend  → redis://cache.railway.app:6379
```

---

## Container Startup Order & Dependencies

```
START SEQUENCE (docker-compose up -d):

1. PostgreSQL starts
   ↓ (waits for health check: pg_isready)
   
2. Redis starts
   ↓ (waits for health check: redis-cli ping)
   
3. Backend starts
   ├─ Waits for PostgreSQL to be healthy
   ├─ Waits for Redis to be healthy
   ├─ Runs: node src/server.js
   └─ Initializes database tables
   
4. Frontend starts
   ├─ Waits for Backend to be healthy
   ├─ Builds React app
   └─ Serves on port 3000
```

---

## Storage Options: S3 Alternatives

### Current: Local File Storage

**What we have now:**
```
./uploads/
├── 1704067200000-kubernetes.pdf  (16MB)
├── 1704067300000-react-guide.pdf (8MB)
└── temp/
    ├── processing-123.txt
    └── temp-456.txt
```

**Pros:**
- Free
- Simple
- Works locally

**Cons:**
- Doesn't scale (files lost if server restarts)
- Not shareable across multiple backend instances
- Limited by disk space

---

### Storage Alternative 1: AWS S3 (Most Popular)

**Cost:** $0.023/GB/month (very cheap)

**Setup:**
```bash
npm install aws-sdk
```

**Code Example:**
```javascript
// services/s3Service.js
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

async function uploadFile(filePath, fileName) {
  const fileContent = fs.readFileSync(filePath);
  
  const params = {
    Bucket: 'rag-chat-bucket',
    Key: `uploads/${Date.now()}-${fileName}`,
    Body: fileContent,
  };
  
  return s3.upload(params).promise();
}

async function downloadFile(s3Key) {
  const params = {
    Bucket: 'rag-chat-bucket',
    Key: s3Key,
  };
  
  return s3.getObject(params).promise();
}
```

**Pros:**
- Scales infinitely
- Highly reliable
- Works across multiple servers
- CDN integration available
- Industry standard

**Cons:**
- Costs money (though very cheap)
- Requires AWS account setup

---

### Storage Alternative 2: Cloudflare R2 (S3 Compatible, Cheaper)

**Cost:** $0.015/GB/month (cheaper than S3)

**Why Cloudflare R2:**
- S3-compatible API (drop-in replacement)
- Cheaper than AWS S3
- No egress charges (AWS charges for downloads)
- Great for public files (CDN included)

**Setup:**
```bash
npm install @aws-sdk/client-s3
```

**Code Example:**
```javascript
// services/r2Service.js
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_KEY,
  },
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

async function uploadFile(filePath, fileName) {
  const fileContent = fs.readFileSync(filePath);
  
  const command = new PutObjectCommand({
    Bucket: 'rag-chat-bucket',
    Key: `uploads/${Date.now()}-${fileName}`,
    Body: fileContent,
  });
  
  return client.send(command);
}
```

**Pros:**
- Cheaper than S3
- S3-compatible
- No egress charges
- Perfect for our use case

**Cons:**
- Smaller company than AWS
- Slightly less mature

---

### Storage Alternative 3: Supabase Storage (PostgreSQL + S3 Wrapper)

**Cost:** Free tier available, $5/month for paid

**Why Supabase:**
- Built on top of S3
- PostgreSQL integrated
- Simple SDK
- RLS (Row Level Security)

**Code Example:**
```javascript
// services/supabaseStorage.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function uploadFile(filePath, fileName) {
  const fileContent = fs.readFileSync(filePath);
  
  const { data, error } = await supabase
    .storage
    .from('pdfs')
    .upload(`uploads/${Date.now()}-${fileName}`, fileContent);
  
  if (error) throw error;
  return data;
}
```

**Pros:**
- Free tier
- Integrated with PostgreSQL
- Simple API
- Good for beginners

**Cons:**
- Limited free storage
- Less mature than S3

---

### Storage Alternative 4: MinIO (Self-Hosted S3)

**Cost:** Free (open-source)

**Why MinIO:**
- S3-compatible
- Self-hosted
- Can run in Docker
- No cloud vendor lock-in

**Docker Setup:**
```yaml
minio:
  image: minio/minio:latest
  container_name: rag_chat_minio
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - minio_data:/minio_data
  command: server /minio_data --console-address ":9001"
  networks:
    - rag_network
```

**Pros:**
- Free
- S3-compatible
- Self-hosted
- Full control

**Cons:**
- Requires management
- No built-in CDN
- You handle backups
- Storage limited by your disk

---

## Comparison Table: Storage Options

| Option | Cost | Ease | Scalability | Best For |
|--------|------|------|-------------|----------|
| **Local** | Free | ⭐⭐⭐⭐⭐ | ❌ | Development only |
| **AWS S3** | $0.023/GB | ⭐⭐⭐⭐ | ✅ Production | Scale to millions |
| **Cloudflare R2** | $0.015/GB | ⭐⭐⭐⭐ | ✅ Production | Cost-conscious |
| **Supabase** | Free/month | ⭐⭐⭐⭐⭐ | ✅ Moderate | Beginners + PG |
| **MinIO** | Free | ⭐⭐⭐ | ✅ Self-hosted | Enterprise |

---

## Recommendation for You

### Development (Right Now)
```
Use LOCAL storage
├─ ./uploads/ directory
├─ Zero cost
├─ Perfect for learning
└─ Switch later when scaling
```

### Production (When Scaling)
```
Use Cloudflare R2
├─ Cheaper than S3 ($0.015/GB vs $0.023/GB)
├─ No egress charges (save 30-50%)
├─ S3-compatible code (easy migration from S3)
├─ CDN included
└─ ~$0.50/month for 50GB
```

---

## Migration Path: Local → Cloudflare R2

**Step 1: Write abstraction layer**
```javascript
// services/storageService.js
const isProduction = process.env.NODE_ENV === 'production';

async function uploadFile(filePath, fileName) {
  if (isProduction) {
    return uploadToR2(filePath, fileName);
  } else {
    return uploadLocal(filePath, fileName);
  }
}

module.exports = { uploadFile };
```

**Step 2: Controllers don't change**
```javascript
// Controllers call storageService, not S3 directly
const storage = require('../services/storageService');
await storage.uploadFile(path, name);
```

**Step 3: Easy switch later**
- Just change `storageService.js` to use R2
- No other code changes needed!

---

## Container Memory & Resource Requirements

### For Development (Your Laptop)

```
PostgreSQL:    ~200MB RAM
Redis:         ~50MB RAM
Backend:       ~150MB RAM
Frontend:      ~100MB RAM
─────────────────────────
Total:         ~500MB RAM
```

**Your laptop can easily handle this!**

### For Production (Railway)

Railway charges by usage:
```
Basic:   $5/month compute
├─ 100 hours/month shared CPU
├─ 256MB RAM
└─ Good for MVP

Standard: $10/month compute
├─ 500 hours/month shared CPU
├─ 512MB RAM
└─ Good for 100-1k users

Professional: Custom pricing
└─ Dedicated resources
```

---

## Docker Best Practices in Our Setup

### Health Checks
```yaml
PostgreSQL:
  healthcheck: pg_isready -U dev
  Ensures database is ready before backend starts

Redis:
  healthcheck: redis-cli ping
  Ensures cache is ready before backend starts

Backend:
  healthcheck: HTTP GET /api/health
  Ensures API is ready before frontend starts
```

### Volumes (Data Persistence)

```yaml
PostgreSQL:
  volumes:
    - postgres_data:/var/lib/postgresql/data
  ✅ Data persists between restarts
  ✅ Database not lost when container stops

Redis:
  volumes: (optional)
    - redis_data:/data
  ❌ No volume = data lost on restart
  ✅ Fine for dev (cache is temporary anyway)

Backend:
  volumes:
    - ./backend:/app
  ✅ Hot reload (code changes without restart)
  ✅ Development only

Frontend:
  volumes:
    - ./frontend:/app
  ✅ Hot reload
  ✅ Development only
```

### Network

```yaml
networks:
  rag_network:
    driver: bridge
    ✅ Containers talk to each other by name
    ✅ Isolated from host network
    ✅ More secure
```

---

## Complete Setup Checklist

### Prerequisites
- [ ] Docker Desktop installed
- [ ] Docker daemon running
- [ ] Git cloned your repo
- [ ] .env file with API keys

### Commands

```bash
# View all containers
docker ps -a

# Start everything
docker-compose up -d

# See logs
docker-compose logs -f backend

# Stop everything
docker-compose down

# Stop and remove volumes (start fresh)
docker-compose down -v

# Build specific service
docker-compose build backend

# Rebuild and restart
docker-compose up -d --build

# Connect to database inside container
docker exec -it rag_chat_postgres psql -U dev -d rag_chat

# Connect to Redis inside container
docker exec -it rag_chat_redis redis-cli

# See container sizes
docker ps -as
```

---

## Total Costs Summary

### Development (Local)
```
Docker Containers: FREE
Storage (local): FREE
APIs (Groq, HF): FREE tier
─────────────────────
Total: $0
```

### Production (First Month)

**Option A: Cloudflare R2 + Railway**
```
Backend: $10/month (Railway)
Frontend: $0/month (Vercel/Netlify)
PostgreSQL: $5/month (Railway)
Redis: $5/month (Railway)
Storage: $0.50/month (R2, 50GB)
APIs: FREE (Groq, HF free tier)
─────────────────────────
Total: ~$20.50/month
```

**Option B: AWS S3 + Railway**
```
Backend: $10/month
Frontend: $0/month
PostgreSQL: $5/month
Redis: $5/month
Storage: $1.15/month (S3, 50GB)
APIs: FREE
─────────────────────────
Total: ~$21.15/month
```

**Option C: Everything on Railway**
```
Backend: $10/month
Frontend: $10/month (Railway instead of Vercel)
PostgreSQL: $5/month (Railway)
Redis: $5/month (Railway)
Storage: $0.50/month (Cloudflare R2)
APIs: FREE
─────────────────────────
Total: ~$30.50/month
```

---

## Quick Start (Right Now)

```bash
# 1. Create docker-compose.yml (see above)

# 2. Start containers
docker-compose up -d

# 3. Initialize database
npm run init-db

# 4. Start development
npm run dev (backend)
npm run dev (frontend in another terminal)

# 5. Open browser
http://localhost:3000
```

---

## Summary

### Containers (4 total):
1. **PostgreSQL** (database + vectors)
2. **Redis** (cache + queue)
3. **Backend** (Express.js)
4. **Frontend** (React)

### Storage Strategy:
- **Development:** Local ./uploads/
- **Production:** Cloudflare R2 (cheapest, best for our use case)

### Total Cost:
- **Development:** $0
- **Production:** ~$20-30/month (extremely affordable)

You're all set! Ready to start? 🚀