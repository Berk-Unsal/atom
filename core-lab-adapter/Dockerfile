FROM golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN go build -o /out/core-lab-adapter .

FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
WORKDIR /app
RUN addgroup -S atom && adduser -S atom -G atom
COPY --from=build /out/core-lab-adapter /app/core-lab-adapter
EXPOSE 8090
USER atom
CMD ["./core-lab-adapter"]
