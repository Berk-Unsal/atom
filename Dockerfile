FROM node:18-alpine AS frontend-build
WORKDIR /frontend

COPY frontend-react/package*.json ./
RUN npm ci

COPY frontend-react/ ./
RUN npm run build

FROM golang:1.22-alpine AS backend-build
WORKDIR /src/backend-go

ARG VERSION
ARG COMMIT=unknown

COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download

COPY backend-go/ ./
COPY VERSION /src/VERSION
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags "-s -w -X main.appVersion=${VERSION:-$(cat /src/VERSION)} -X main.buildCommit=${COMMIT}" \
    -o /server .

FROM alpine:latest AS production
WORKDIR /app

RUN addgroup -S atom && adduser -S atom -G atom

COPY --from=backend-build /server ./server
COPY --from=frontend-build /frontend/dist ./dist
COPY data-pipeline/ankara_buildings.geojson ./data-pipeline/ankara_buildings.geojson
COPY data-pipeline/ankara_5g_nodes.geojson ./data-pipeline/ankara_5g_nodes.geojson
COPY data-pipeline/ankara_5g_nodes.csv ./data-pipeline/ankara_5g_nodes.csv
COPY data-pipeline/manifest.json ./data-pipeline/manifest.json

ENV GIN_MODE=release
ENV PORT=8080
ENV FRONTEND_DIST_PATH=/app/dist
ENV MAX_CONCURRENT_RF_REQUESTS=2
ENV ATOM_DATASET_DIR=/app/data-pipeline

EXPOSE 8080

USER atom
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/readyz || exit 1
CMD ["./server"]
