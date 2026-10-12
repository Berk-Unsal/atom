import { describe, expect, it } from "vitest";
import { compactRecommendationResponse, recommendationMapFeatures } from "./recommendations.js";

const recommendation = {
  id: "LTE-3",
  cell_id: 3,
  marginal_network_score: 120,
  reason: "adds demand",
};

describe("recommendation response helpers", () => {
  it("compacts legacy feature properties to a GeoJSON id reference", () => {
    const compacted = compactRecommendationResponse({
      recommendations: [recommendation],
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: recommendation,
          geometry: { type: "Point", coordinates: [32.85, 39.92] },
        }],
      },
    });

    expect(compacted.geojson.features[0]).toMatchObject({ id: "LTE-3", properties: {} });
    expect(JSON.stringify(compacted).match(/marginal_network_score/g)).toHaveLength(1);
  });

  it("joins compact map features to canonical recommendation records at render time", () => {
    const [feature] = recommendationMapFeatures({
      recommendations: [recommendation],
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          id: "LTE-3",
          properties: {},
          geometry: { type: "Point", coordinates: [32.85, 39.92] },
        }],
      },
    });

    expect(feature.properties).toBe(recommendation);
  });
});
