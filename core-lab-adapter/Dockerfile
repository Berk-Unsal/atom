FROM golang:1.27.4-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN go build -o /out/core-lab-adapter .

FROM alpine:3.24@sha256:3f4d6b32e26703c6082839234f43769d5046b3ac7c910033911d1e71d8cd630a
WORKDIR /app
RUN addgroup -S atom && adduser -S atom -G atom
COPY --from=build /out/core-lab-adapter /app/core-lab-adapter
EXPOSE 8090
USER atom
CMD ["./core-lab-adapter"]
