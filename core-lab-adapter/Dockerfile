FROM golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN go build -o /out/core-lab-adapter .

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
WORKDIR /app
RUN addgroup -S atom && adduser -S atom -G atom
COPY --from=build /out/core-lab-adapter /app/core-lab-adapter
EXPOSE 8090
USER atom
CMD ["./core-lab-adapter"]
