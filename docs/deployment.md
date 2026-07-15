# Deployment

Deploy A.T.O.M as a planning service with explicit resource limits. The API has no built-in authentication, so internet-facing deployments require a trusted reverse proxy or gateway.

## Deployment Options

### Option 1: Docker Container (Recommended)

**Best for**: Most deployments, cloud platforms, Kubernetes

#### Single Container

```bash
docker run \
  -d \
  --name atom-api \
  -p 8080:8080 \
  -e PORT=8080 \
  --memory=1g \
  --cpus=2 \
  atom-simulator
```

#### Docker Compose

```yaml
version: '3.8'

services:
  atom-api:
    image: atom-simulator:latest
    container_name: atom-api
    ports:
      - "8080:8080"
    environment:
      PORT: 8080
      MAX_CONCURRENT_RF_REQUESTS: 2
    resources:
      limits:
        cpus: '2'
        memory: 1G
      reservations:
        cpus: '1'
        memory: 512M
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8080/readyz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
```

**Run**:

```bash
docker-compose up -d
```

---

### Option 2: Kubernetes (Enterprise)

#### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: atom-api
  labels:
    app: atom
spec:
  replicas: 3
  selector:
    matchLabels:
      app: atom
  template:
    metadata:
      labels:
        app: atom
    spec:
      containers:
      - name: atom
        image: atom-simulator:1.0.0
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: MAX_CONCURRENT_RF_REQUESTS
          value: "2"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: atom-service
spec:
  selector:
    app: atom
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer
```

**Deploy**:

```bash
kubectl apply -f deployment.yaml

# Verify
kubectl get pods -l app=atom
kubectl get service atom-service
```

---

### Option 3: Cloud Platforms

#### AWS ECS

```bash
# Create ECR repository
aws ecr create-repository --repository-name atom-simulator

# Push image
docker tag atom-simulator:latest [AWS_ACCOUNT].dkr.ecr.[REGION].amazonaws.com/atom-simulator:latest
docker push [AWS_ACCOUNT].dkr.ecr.[REGION].amazonaws.com/atom-simulator:latest

# Create ECS task definition (JSON)
# Then deploy via AWS Console or CLI
```

#### Google Cloud Run

```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/[PROJECT]/atom-simulator

# Deploy
gcloud run deploy atom-api \
  --image gcr.io/[PROJECT]/atom-simulator \
  --platform managed \
  --region us-central1 \
  --memory 1Gi \
  --cpu 2
```

#### Azure Container Instances

```bash
# Push to Azure Container Registry
az acr build --registry myregistry --image atom-simulator:1.0 .

# Deploy
az container create \
  --resource-group mygroup \
  --name atom-api \
  --image myregistry.azurecr.io/atom-simulator:1.0 \
  --cpu 2 \
  --memory 1
```

---

## Production Configuration

### Reverse Proxy (nginx)

```nginx
upstream atom_backend {
    server atom-api:8080;
}

server {
    listen 80;
    server_name _;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;

    # CORS headers
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;

    # Proxy to backend
    location /api/ {
        proxy_pass http://atom_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static frontend
    location / {
        proxy_pass http://atom_backend;
        proxy_set_header Host $host;
    }

    # Health check endpoint (doesn't count toward rate limit)
    location /healthz {
        access_log off;
        proxy_pass http://atom_backend;
    }

    location /readyz {
        access_log off;
        proxy_pass http://atom_backend;
    }
}
```

### Resource Allocation

#### Minimum (Development)

```
CPU: 1 core
Memory: 512 MB
Storage: 2 GB (container image + cache)
```

#### Recommended (Production)

```
CPU: 2-4 cores (depends on request volume)
Memory: 1-2 GB
Storage: 10 GB (includes backups)
Bandwidth: 10 Mbps egress
```

#### High Traffic (Enterprise)

```
CPU: 4-8 cores per instance (multiple replicas)
Memory: 2-4 GB per instance
Storage: 50+ GB (includes logs, monitoring)
Bandwidth: 100+ Mbps egress
Load Balancer: Yes (round-robin across instances)
```

---

## Monitoring & Observability

### Health Checks

```bash
# Liveness: process is accepting HTTP requests
curl http://localhost:8080/healthz

# Readiness: datasets and frontend bundle are available
curl --fail http://localhost:8080/readyz
```

`/healthz` is a liveness endpoint and always returns `200` while the process is running. `/readyz` returns `503` until buildings, towers, and the frontend bundle are available.

### Logs

**Docker**:
```bash
docker logs -f atom-api
```

**Kubernetes**:
```bash
kubectl logs -f deployment/atom-api
```

**Application Logs**:
- All requests logged with timestamp, method, path, status, latency
- Errors logged with full stack trace
- Startup events (data loading, server start)

### Metrics

Recommended Prometheus metrics to expose:

```
atom_simulate_duration_seconds    # Request latency
atom_optimize_duration_seconds    # Optimization latency
atom_buildings_loaded              # Count of loaded buildings
atom_towers_loaded                 # Count of loaded towers
atom_rtree_query_time_seconds      # R-Tree lookup time
http_requests_total                # Total HTTP requests
http_request_duration_seconds      # HTTP latency histogram
```

### Alerting

Set alerts for:

```yaml
alerts:
  - name: APIDown
    condition: health_check_failed for 5 minutes
    action: Page on-call engineer

  - name: HighLatency
    condition: p99_latency > 5 seconds for 10 minutes
    action: Alert Slack channel

  - name: HighErrorRate
    condition: error_rate > 1% for 5 minutes
    action: Alert team

  - name: HighMemory
    condition: memory_usage > 90% for 5 minutes
    action: Auto-scale up
```

---

## Scaling

### Horizontal Scaling (Multiple Instances)

A.T.O.M is **stateless** and scales horizontally:

```yaml
# Kubernetes: Scale to 5 replicas
kubectl scale deployment atom-api --replicas=5

# Docker Compose: Use multiple services
atom-api-1:
  image: atom-simulator
  ports: ["8081:8080"]
  
atom-api-2:
  image: atom-simulator
  ports: ["8082:8080"]
  
load-balancer:
  image: nginx:latest
  ports: ["80:80"]
  depends_on: [atom-api-1, atom-api-2]
```

### Vertical Scaling (Larger Machines)

Each RF request uses at most four workers, and the process accepts two concurrent RF jobs by default. Increase `MAX_CONCURRENT_RF_REQUESTS` only after measuring CPU and latency under representative requests; scaling is workload-dependent and is not expected to be linear.

### Caching

Consider caching simulation results:

```nginx
# Cache GET /api/towers (changes infrequently)
location /api/towers {
    proxy_cache_valid 200 1d;
    proxy_pass http://atom_backend;
}

# Don't cache POST /api/simulate or /api/coverage-gaps (results vary)
location /api/simulate {
    proxy_cache_bypass $request_method;
    proxy_pass http://atom_backend;
}

location /api/coverage-gaps {
    proxy_cache_bypass $request_method;
    proxy_pass http://atom_backend;
}
```

---

## Disaster Recovery

### Backup Strategy

1. **Data Files**: Version control GeoJSON in Git
2. **Configuration**: Store environment variables in secrets manager
3. **Container Images**: Tag and push to registry with version

### High Availability

1. **Multiple Replicas**: Always run ≥3 instances
2. **Load Balancer**: Distribute requests across replicas
3. **Health Checks**: Automatic restart of failed instances
4. **Data Redundancy**: GeoJSON baked into image (no external DB)

### Rollback Procedure

```bash
# If new version has issues, rollback:
kubectl set image deployment/atom-api \
  atom-api=atom-simulator:previous-version

# Or with Docker Compose:
docker-compose pull && docker-compose up -d
```

---

## Security

### Network Security

- ✅ Use HTTPS only (TLS 1.2+)
- ✅ Enable CORS restrictions
- ✅ Implement rate limiting
- ✅ Run behind reverse proxy (nginx/HAProxy)
- ✅ Use private subnets for backend
- ✅ Firewall rules: limit ingress to necessary ports

### Application Security

- ✅ Validate all inputs
- ✅ No hardcoded secrets
- ✅ Use environment variables for sensitive config
- ✅ Regular dependency updates
- ✅ Security scanning in CI/CD

### Container Security

- ✅ Run as non-root user
- ✅ Use read-only filesystem where possible
- ✅ Regular base image updates (Alpine)
- ✅ No privileged containers

---

## Performance Tuning

### Go Runtime Tuning

```bash
# Set max goroutines per request
export GOMAXPROCS=4

# Enable memory profiling
export GODEBUG=gctrace=1

# Start with profiling
go run . -cpuprofile=cpu.prof
```

### OS Tuning

```bash
# Increase file descriptor limit
ulimit -n 65536

# Tune network buffer
sysctl -w net.core.rmem_max=134217728
sysctl -w net.core.wmem_max=134217728
```

---

## Cost Optimization

| Platform | Instance Type | Monthly Cost |
|----------|---------------|-------------|
| **AWS** | t3.large | ~$60 |
| **Google Cloud** | n1-standard-2 | ~$50 |
| **Azure** | Standard_B2s | ~$40 |
| **Bare Metal** | 2-core 4GB RAM | ~$20 |

---

## Documentation: GitHub Pages

Host A.T.O.M's static documentation for free on GitHub Pages.

### Setup Steps

#### 1. Enable GitHub Pages

1. Go to your repository settings
2. Navigate to **Settings → Pages**
3. **Source**: Select "Deploy from branch"
4. **Branch**: Select your publishing branch and the `/docs` folder

#### 2. Static Files

The docs site is checked in as `docs/index.html`. Supporting markdown, screenshots, report charts, icons, and the academic report PDF live under `docs/`, so GitHub Pages can serve them without a static-site generator or custom build step.

#### 3. Optional Custom Domain

If you later add a custom domain, configure it in GitHub repository settings and add a matching `docs/CNAME` file. Leave `docs/CNAME` absent when publishing under the normal GitHub Pages project URL.

### Manual Build & Deploy

If you prefer manual verification:

```bash
python3 -m http.server 9000 --directory docs
```

### View Live Documentation

- **Default**: `https://<github-user>.github.io/<repository>/`

### Troubleshooting

**Docs not showing up?**
1. Check the configured branch and `/docs` folder in Settings → Pages
2. Wait 1-2 minutes for deployment
3. Confirm `docs/index.html` exists in the published branch

**Custom domain not working?**
1. Verify CNAME file in docs/
2. Check DNS records for your configured hostname
3. Wait 24 hours for DNS propagation

---

**Next**: See [FAQ](faq.md) for common questions or [API Reference](api.md) for integration.
