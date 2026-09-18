package main

import (
	"net/http"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

func registerSubTHZP1411ReferenceRoute(router *gin.Engine, runtime *datasetRuntime) {
	router.POST("/api/sub-thz-p1411-reference", func(c *gin.Context) {
		var input raytracer.P1411ReferenceRequestInput
		if !bindJSON(c, &input, "sub-thz P.1411 reference") {
			return
		}
		request := input.ToRequest()
		if validationError := raytracer.ValidateP1411ReferenceRequest(input, request); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		buildings := raytracer.EmptyBuildingIndex()
		if pack := runtime.Current(); pack != nil && pack.BuildingIndex != nil {
			buildings = pack.BuildingIndex
		}
		response, err := raytracer.EvaluateP1411ReferenceContext(c.Request.Context(), request, buildings)
		writeRFResponse(c, response, err)
	})
}
