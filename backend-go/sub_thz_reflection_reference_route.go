package main

import (
	"net/http"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

// registerSubTHZReflectionReferenceRoute is an isolated opt-in diagnostic.
// It never dispatches through /api/simulate and never mutates a canonical RF
// profile, coverage surface, interference ledger, optimizer, or radio quality.
func registerSubTHZReflectionReferenceRoute(router *gin.Engine, runtime *datasetRuntime) {
	router.POST("/api/sub-thz-reflection-reference", func(c *gin.Context) {
		var request raytracer.SpecularReflectionReferenceRequest
		if !bindJSON(c, &request, "sub-thz specular reflection reference") {
			return
		}
		if validationError := raytracer.ValidateSpecularReflectionReferenceRequest(request); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		buildings := raytracer.EmptyBuildingIndex()
		if runtime != nil && runtime.Current() != nil && runtime.Current().BuildingIndex != nil {
			buildings = runtime.Current().BuildingIndex
		}
		response, err := raytracer.EvaluateSpecularReflectionReferenceContext(c.Request.Context(), request, buildings)
		writeRFResponse(c, response, err)
	})
}
