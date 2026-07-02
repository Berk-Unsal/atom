FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN go build -o /out/core-lab-adapter .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/core-lab-adapter /app/core-lab-adapter
EXPOSE 8090
CMD ["./core-lab-adapter"]
