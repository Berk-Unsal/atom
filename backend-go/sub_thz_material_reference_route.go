package main

import (
	"net/http"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

// registerSubTHZMaterialReferenceRoute stays independent from the dataset and
// canonical RF routes. It evaluates one declared homogeneous material slab;
// it never mutates a propagation profile or contributes a path-loss term.
func registerSubTHZMaterialReferenceRoute(router *gin.Engine) {
	router.POST("/api/sub-thz-material-reference", func(c *gin.Context) {
		var request raytracer.MaterialReferenceRequest
		if !bindJSON(c, &request, "sub-thz material reference") {
			return
		}
		if validationError := raytracer.ValidateMaterialReferenceRequest(request); validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}
		response, err := raytracer.EvaluateMaterialReferenceContext(c.Request.Context(), request)
		writeRFResponse(c, response, err)
	})
}
