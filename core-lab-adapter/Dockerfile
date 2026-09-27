FROM golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS build
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
