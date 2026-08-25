FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS frontend-build
WORKDIR /frontend

COPY frontend-react/package*.json ./
RUN npm ci

COPY frontend-react/ ./
RUN npm run build

FROM golang:1.27.0-alpine@sha256:4c9fe60190a2a3350ddc51de80d0224b8a6698d12bdfc999fee45ea9d6c46dbc AS backend-build
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

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS production
WORKDIR /app

RUN addgroup -S atom && adduser -S atom -G atom

COPY --from=backend-build /server ./server
COPY --from=frontend-build /frontend/dist ./dist
COPY data-pipeline/ankara_buildings.geojson ./data-pipeline/ankara_buildings.geojson
COPY data-pipeline/ankara_5g_nodes.geojson ./data-pipeline/ankara_5g_nodes.geojson
COPY data-pipeline/ankara_5g_nodes.csv ./data-pipeline/ankara_5g_nodes.csv
COPY data-pipeline/manifest.json ./data-pipeline/manifest.json

ENV GIN_MODE=release
ENV BIND_ADDRESS=0.0.0.0
ENV PORT=8080
ENV FRONTEND_DIST_PATH=/app/dist
ENV MAX_CONCURRENT_RF_REQUESTS=2
ENV MAX_CONCURRENT_RF_REQUESTS_PER_CLIENT=1
ENV RF_REQUESTS_PER_MINUTE=20
ENV RF_REQUEST_TIMEOUT_SECONDS=60
ENV MAX_CONCURRENT_BUILDING_DOWNLOADS=2
ENV MAX_CONCURRENT_BUILDING_DOWNLOADS_PER_CLIENT=1
ENV BUILDING_DOWNLOADS_PER_MINUTE=2
ENV ATOM_DATASET_DIR=/app/data-pipeline

EXPOSE 8080

USER atom
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/readyz || exit 1
CMD ["./server"]
