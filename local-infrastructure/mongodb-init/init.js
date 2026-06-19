db = db.getSiblingDB("ankara_raytracer");

db.createCollection("base_stations");
db.base_stations.createIndex(
  { location: "2dsphere" },
  { name: "location_2dsphere" }
);

db.base_stations.createIndex(
  { cell_id: 1, radio_type: 1 },
  { name: "cell_radio_unique", unique: true }
);
