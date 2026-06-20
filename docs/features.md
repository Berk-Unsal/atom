# Features

A.T.O.M provides a comprehensive suite of RF simulation and optimization capabilities.

## Multi-Generation Physics

### Supported Frequency Bands

| Band | Frequency | Wavelength | Primary Use Case |
|------|-----------|-----------|-----------------|
| **4G LTE** | 2.6 GHz | 11.5 cm | Wide-area coverage |
| **5G mmWave** | 28 GHz | 1.07 cm | High-capacity urban |
| **6G Sub-THz** | 140 GHz | 2.14 mm | Ultra-high-capacity |

### Free-Space Path Loss (FSPL)

All bands use the standard FSPL equation:

$$L = 20 \log_{10}(d[m]) + 20 \log_{10}(f[GHz]) + 92.45$$

Where:
- $d$ = distance in meters
- $f$ = frequency in GHz
- $L$ = path loss in dB

### Wall Attenuation

The current backend applies generation-specific penetration losses when a ray crosses a building boundary:

| Scenario | 4G LTE | 5G mmWave | 6G Sub-THz |
|----------|--------|-----------|------------|
| Solid wall crossing | +8 dB | +30 dB | +80 dB |
| Dense facade / repeated crossings | cumulative | cumulative | cumulative |

Material tags such as concrete, office, glass, and foliage can still be used to refine the behavior per obstacle type.

## Segmented Heatmap Raytracing

### Color-Coded Signal Strength

Rays are visualized with **dynamic color gradients** based on received signal strength (Rx dBm):

- 🟢 **Green** (-50 to -70 dBm): Strong signal, excellent coverage
- 🟡 **Yellow** (-70 to -90 dBm): Moderate signal, usable coverage
- 🔴 **Red** (-90 to -110 dBm): Weak signal, marginal coverage

### Ray Segmentation Algorithm

Instead of single rays from TX to each point, A.T.O.M generates **discrete segments**:

1. Start at transmitter antenna
2. Cast ray toward target location
3. Check polygon (building) intersections
4. Apply cumulative wall loss
5. Color segment based on final Rx dBm
6. Export as GeoJSON linestring

This enables:
- Precise visualization of signal degradation
- Identification of urban canyons and shadow areas
- Intuitive understanding of frequency-band differences

## Frequency-Dependent Penetration

### 4G Propagation
- **Penetrates** concrete buildings with cumulative losses
- **Diffracts** over rooftops
- **Reaches** interior locations with degradation
- **Result**: Wide coverage area despite obstacles

### 5G mmWave Propagation
- **Heavily attenuates** through walls
- **Requires** line-of-sight in many cases
- **Blocks** at forest edges
- **Result**: Tight, directional coverage in dense areas

### 6G Sub-THz Propagation
- **Nearly blocked** by most building materials
- **Ultra-tight** spatial requirements
- **Requires** optimal beamforming angles
- **Result**: Localized coverage with high spectral efficiency

## Smart Beamforming

### Antenna Parameters

Each transmitter can be configured with:

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Azimuth** | 0° - 360° | Horizontal direction of main lobe |
| **Beam Width** | 5° - 180° | Angular width of coverage sector |
| **Tilt** | -20° to +90° | Vertical angle from horizontal |
| **Power** | 0 - 50 dBm | Transmit power level |

### Sector Coverage

Beamforming creates **directional sectors** instead of omnidirectional patterns:

- Typical 3-sector setup: 120° coverage each
- Each sector independently optimizable
- Reduces interference between sectors
- Improves spectral efficiency

## AI Auto-Optimization

### Coverage Maximization Algorithm

A.T.O.M uses a **sweep-and-score** geometric optimization to find the optimal antenna azimuth:

**Algorithm**:

1. Define candidate azimuth angles (5° intervals)
2. For each azimuth:
   - Cast rays to surrounding area
   - Calculate coverage area: $\sum r^2$ (sum of squared ray distances)
   - Apply frequency-specific attenuation
   - Compute total coverage score
3. Select azimuth with maximum coverage
4. Automatically snap antenna to optimal angle

**Result**: Engineers don't manually guess antenna directions; A.T.O.M finds optimal placement in seconds.

### Performance

- Typical optimization runtime: < 500 ms for 360° sweep
- Tested on 12,000+ building geometries
- Supports batch multi-site optimization

## Interactive Visualization

### Web-Based UI

- **Leaflet Maps**: Standard web mapping library
- **GeoJSON Layers**: Dynamic overlay of coverage heatmaps
- **Real-time Updates**: Instant response to parameter changes
- **Responsive Design**: Works on desktop and tablet

### Control Panel Features

- Frequency band selector (4G/5G/6G)
- Azimuth angle adjustment (slider or numeric input)
- Beam width configuration
- Transmit power control
- Coverage area display
- Signal strength colorbar

## GeoJSON Export

All visualization data is stored in **GeoJSON format**:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "frequency": "5G",
        "azimuth": 45,
        "rx_dbm": -75,
        "signal_quality": "good"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [...]
      }
    }
  ]
}
```

### Benefits

- 📁 **Portable**: Import into ArcGIS, QGIS, Google Earth Pro
- 🔄 **Interoperable**: Standard format supported by all GIS tools
- 📊 **Archivable**: Version control your simulation outputs
- 🔗 **Shareable**: Send results to team members instantly

## Performance Characteristics

### Scalability

| Metric | Value |
|--------|-------|
| Building geometries | Up to 50,000 per simulation |
| Ray-polygon intersections | Sub-millisecond per query (R-Tree) |
| Heatmap generation | < 2 seconds for 10,000-point grid |
| API response time | < 100 ms (p99) |

### Concurrency

- **Go Goroutines**: Each ray batch processes in parallel
- **Multi-core utilization**: Automatic load balancing
- **Memory efficiency**: In-memory R-Tree (typically < 500 MB for Ankara)
- **No external processes**: Self-contained in single container

## Data Sources

### OpenStreetMap (OSM)

- Building footprints with material tags
- Street geometry and terrain features
- Vegetation layer for obstruction modeling

### OpenCellID

- Real 5G tower locations
- Equipment specifications
- Historical coverage data

### Custom Data

Users can import:
- Custom building geometries (Shapefile, GeoJSON)
- Terrain elevation models (GeoTIFF)
- Custom antenna specifications
- Proprietary building material database

---

**Next**: Dive into [Architecture](architecture.md) or see visual examples in [Visualization](visualization.md).
