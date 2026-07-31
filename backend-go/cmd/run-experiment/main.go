package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const maxDefinitionBytes int64 = 1 << 20

type jobResponse struct {
	JobID   string          `json:"job_id"`
	Status  string          `json:"status"`
	Message string          `json:"message"`
	Result  json.RawMessage `json:"result"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "experiment:", err)
		os.Exit(1)
	}
}

func run() error {
	definitionPath := flag.String("definition", "", "path to an .atom-experiment.json definition")
	baseURL := flag.String("base-url", "http://localhost:8080", "A.T.O.M API base URL")
	apiKey := flag.String("api-key", "", "optional RF API key")
	pollInterval := flag.Duration("poll", 750*time.Millisecond, "job polling interval")
	flag.Parse()
	if strings.TrimSpace(*definitionPath) == "" {
		return errors.New("-definition is required")
	}
	parsedBase, err := url.Parse(strings.TrimRight(*baseURL, "/"))
	if err != nil || parsedBase.Scheme != "http" && parsedBase.Scheme != "https" || parsedBase.Host == "" {
		return errors.New("-base-url must be an absolute http(s) URL")
	}
	file, err := os.Open(*definitionPath)
	if err != nil {
		return err
	}
	definition, err := io.ReadAll(io.LimitReader(file, maxDefinitionBytes+1))
	file.Close()
	if err != nil {
		return err
	}
	if int64(len(definition)) > maxDefinitionBytes || !json.Valid(definition) {
		return errors.New("definition must be valid JSON no larger than 1 MiB")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	client := &http.Client{Timeout: 30 * time.Second}
	job, err := requestJob(ctx, client, http.MethodPost, parsedBase.String()+"/api/processes/batch-experiment/execution", definition, *apiKey)
	if err != nil {
		return err
	}
	for job.Status == "accepted" || job.Status == "running" {
		select {
		case <-ctx.Done():
			_, _ = requestJob(context.Background(), client, http.MethodDelete, parsedBase.String()+"/api/jobs/"+url.PathEscape(job.JobID), nil, *apiKey)
			return ctx.Err()
		case <-time.After(*pollInterval):
		}
		job, err = requestJob(ctx, client, http.MethodGet, parsedBase.String()+"/api/jobs/"+url.PathEscape(job.JobID), nil, *apiKey)
		if err != nil {
			return err
		}
	}
	if job.Status != "succeeded" {
		return fmt.Errorf("job %s: %s", job.Status, job.Message)
	}
	var output any
	if err := json.Unmarshal(job.Result, &output); err != nil {
		return err
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(output)
}

func requestJob(ctx context.Context, client *http.Client, method, endpoint string, body []byte, apiKey string) (jobResponse, error) {
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return jobResponse{}, err
	}
	if len(body) > 0 {
		request.Header.Set("Content-Type", "application/json")
	}
	if apiKey != "" {
		request.Header.Set("X-API-Key", apiKey)
	}
	response, err := client.Do(request)
	if err != nil {
		return jobResponse{}, err
	}
	defer response.Body.Close()
	contents, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	if err != nil {
		return jobResponse{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return jobResponse{}, fmt.Errorf("HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(contents)))
	}
	var job jobResponse
	if err := json.Unmarshal(contents, &job); err != nil {
		return jobResponse{}, err
	}
	return job, nil
}
