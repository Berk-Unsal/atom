package main

import (
	"net/http"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

// registerSubTHZValidationRoute is intentionally independent from the
// dataset-backed RF routes. Measurement validation consumes imported campaign
// evidence and model adapters only; it never runs a canonical coverage or
// propagation simulation.
func registerSubTHZValidationRoute(router *gin.Engine) {
	router.POST("/api/sub-thz-validation", func(c *gin.Context) {
		var request raytracer.SubTHZValidationRequest
		if !bindJSON(c, &request, "sub-thz measurement validation") {
			return
		}
		if validationError := raytracer.ValidateSubTHZValidationRequest(request); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		response, err := raytracer.EvaluateSubTHZValidationContext(c.Request.Context(), request)
		writeRFResponse(c, response, err)
	})
}
