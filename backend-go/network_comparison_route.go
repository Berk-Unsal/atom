package main

import (
	"net/http"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

// registerNetworkComparisonRoute exposes the spatial served-state comparison of two network plans. It is a
// protected RF route: one comparison costs one RF request and evaluates two bounded networks on the active dataset.
func registerNetworkComparisonRoute(router *gin.Engine, buildings func() *raytracer.BuildingIndex) {
	router.POST("/api/compare-network", func(c *gin.Context) {
		var input raytracer.NetworkComparisonRequestInput
		if !bindJSON(c, &input, "network comparison") {
			return
		}
		if input.MissingRequiredTowerFields() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "each tower in a and b must include id, tower_lon, and tower_lat"})
			return
		}
		req := input.ToRequest()
		for _, side := range []struct {
			label   string
			request raytracer.NetworkOptimizationRequest
		}{{"a", req.A}, {"b", req.B}} {
			if validationError := validateNetworkOptimizationRequest(side.request); validationError != "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": side.label + ": " + validationError})
				return
			}
		}
		payload, err := raytracer.CompareNetworksContext(c.Request.Context(), req, buildings())
		writeRFResponse(c, payload, err)
	})
}
