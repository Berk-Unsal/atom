FROM golang:1.26.10-alpine@sha256:5cb67f19c5e7994dcb80c074f7cfca8aeeada45bbdca035f73df269cefdcce61 AS build
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
