package main

import (
	"net/http"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

func registerSubTHZReferenceRoute(router *gin.Engine, runtime *datasetRuntime) {
	router.POST("/api/sub-thz-reference", func(c *gin.Context) {
		var input raytracer.SubTHZAtmosphericReferenceRequestInput
		if !bindJSON(c, &input, "sub-thz atmospheric reference") {
			return
		}
		request := input.ToRequest()
		if validationError := raytracer.ValidateSubTHZAtmosphericReferenceRequest(input, request); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		buildings := raytracer.EmptyBuildingIndex()
		if pack := runtime.Current(); pack != nil && pack.BuildingIndex != nil {
			buildings = pack.BuildingIndex
		}
		response, err := raytracer.EvaluateSubTHZAtmosphericReferenceContext(c.Request.Context(), request, buildings)
		writeRFResponse(c, response, err)
	})
}
