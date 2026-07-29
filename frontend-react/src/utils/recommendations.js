export function compactRecommendationResponse(response) {
  if (!response?.geojson || !Array.isArray(response.geojson.features)) return response;
  const recommendations = response.recommendations ?? [];
  let changed = false;
  const features = response.geojson.features.map((feature, index) => {
    const id = feature?.id ?? feature?.properties?.id ?? recommendations[index]?.id;
    if (typeof id !== "string" || id.length === 0) return feature;
    const properties = feature?.properties ?? {};
    if (feature?.id === id && Object.keys(properties).length === 0) return feature;
    changed = true;
    return { ...feature, id, properties: {} };
  });
  if (!changed) return response;
  return { ...response, geojson: { ...response.geojson, features } };
}

export function recommendationMapFeatures(response) {
  const canonicalByID = new Map(
    (response?.recommendations ?? []).map((recommendation) => [recommendation.id, recommendation]),
  );
  return (response?.geojson?.features ?? []).map((feature) => {
    const legacyProperties = feature?.properties ?? {};
    const id = feature?.id ?? legacyProperties.id;
    return {
      ...feature,
      id,
      properties: canonicalByID.get(id) ?? legacyProperties,
    };
  });
}
