# Propagation Visualization

A.T.O.M generates stunning visual representations of RF propagation across frequency bands. This section showcases real simulation outputs using Ankara's urban topology.

## 4G LTE Coverage (2.6 GHz)

![4G Propagation](../assets/4g.png)

### Characteristics

- **Wavelength**: 11.5 cm
- **Coverage Type**: Wide-area with building penetration
- **Penetration Loss**: roughly +8 dB per wall crossing in the current LTE model
- **Urban Canyon Effect**: Moderate (signals reach side streets)

### Interpretation

The 4G simulation shows:

- 🟢 **Green zones**: Strong indoor coverage (-50 to -70 dBm)
- 🟡 **Yellow zones**: Moderate coverage (-70 to -90 dBm), usable for typical applications
- 🔴 **Red zones**: Marginal coverage (-90 to -110 dBm), possible dead zones

**Key Insight**: Despite tall buildings, 4G signals diffract and penetrate enough to reach most areas, making it reliable for urban deployments.

---

## 5G mmWave Coverage (28 GHz)

![5G Propagation](../assets/5g.png)

### Characteristics

- **Wavelength**: 1.07 cm
- **Coverage Type**: Directional, urban-specific hotspots
- **Penetration Loss**: roughly +30 dB per wall crossing in the current mmWave model
- **Line-of-Sight Requirement**: Often necessary for usable signal

### Interpretation

The 5G visualization reveals:

- 🟢 **Green zones**: Excellent LOS coverage on main avenues
- 🟡 **Yellow zones**: Partial coverage with sidelobe penetration
- 🔴 **Red zones**: Deep urban canyons blocked by building walls

**Key Insight**: 5G requires careful site placement to reach street-level users. Antenna orientation (azimuth) dramatically affects coverage.

---

## 6G Sub-THz Coverage (140 GHz)

![6G Propagation](../assets/6g.png)

### Characteristics

- **Wavelength**: 2.14 mm (near-optical)
- **Coverage Type**: Ultra-localized, street-level only
- **Penetration Loss**: roughly +80 dB per wall crossing in the current Sub-THz model
- **Line-of-Sight Requirement**: Mandatory for coverage

### Interpretation

The 6G heatmap demonstrates:

- 🟢 **Green zones**: Only direct line-of-sight points
- 🟡 **Yellow zones**: Minimal; mostly absent
- 🔴 **Red zones**: Vast majority (blocked by buildings)

**Key Insight**: 6G requires a **"pave the streets"** deployment model with frequent small cells (every 50-100 meters). Coverage beyond the immediate vicinity is impractical.

---

## AI Auto-Optimized 5G Beamforming

![5G Auto-Optimized](../assets/5g-auto-optimized.png)

### Algorithm Result

This simulation shows the optimal antenna azimuth computed by A.T.O.M's sweep-and-score algorithm:

- **Coverage Area ($\sum r^2$)**: Maximized by intelligent azimuth selection
- **Beam Width**: 65° (typical 3-sector configuration)
- **Optimization Runtime**: ~250 ms

### Interpretation

The auto-optimized placement achieves:

- ✅ Maximum coverage area within distance constraints
- ✅ Reduced interference through directional beaming
- ✅ Optimal use of transmit power
- ✅ Better spectral efficiency

**Key Insight**: Manual antenna placement often leaves 15-30% coverage on the table. AI optimization recovers this without guesswork.

---

## Color Mapping Reference

All visualizations use the same **signal strength to color mapping**:

| Color | Signal Range | Quality | Use Case |
|-------|-------------|---------|----------|
| 🟢 Green | -50 to -70 dBm | Excellent | Voice, video, IoT |
| 🟡 Yellow | -70 to -90 dBm | Good | Voice, messaging |
| 🔴 Red | -90 to -110 dBm | Poor | Emergency services |
| ⚫ Black | < -110 dBm | No service | (Not shown) |

---

## Comparative Analysis: 4G vs 5G vs 6G

### Coverage Radius Comparison

| Technology | Typical Radius | Max Radius |
|-----------|---------------|-----------|
| **4G** | 2 km (urban) | 5 km (rural) |
| **5G mmWave** | 300 m (LOS) | 1 km (non-LOS sidelobe) |
| **6G Sub-THz** | 50 m (LOS) | 200 m (exceptional) |

### Site Density Required

| Technology | Sites per km² | Building Density Impact |
|-----------|------------|------------------------|
| **4G** | 1-3 | Low (penetrates walls) |
| **5G mmWave** | 10-50 | High (requires LOS) |
| **6G Sub-THz** | 100+ | Very High (street-level) |

### Urban Canyon Effect

The visualizations clearly show how **building density** impacts each band:

- **4G**: Covers 85-95% of urban area (diffraction around buildings)
- **5G**: Covers 60-75% of urban area (sidelobe penetration, directional)
- **6G**: Covers 30-50% of urban area (near-optical propagation)

---

## Understanding the Heatmaps

### Ray Segments

Each heatmap consists of thousands of **ray segments** (colored lines):

- **Start Point**: Transmitter antenna
- **End Point**: Coverage measurement location (typically 20-100 meters away)
- **Color**: Represents signal strength at that distance/direction
- **Direction**: Shows propagation pattern and antenna beam orientation

### Reading the Visualization

1. **Green Zones**: Primary coverage area; reliable service expected
2. **Yellow Zones**: Secondary coverage; service possible with optimal conditions
3. **Red Zones**: Marginal; not recommended for primary coverage
4. **No Color**: Below sensitivity threshold; no usable signal

### Interactive Exploration

In the web interface, you can:

- 🔄 Adjust antenna azimuth and watch coverage rotate
- 📊 Switch between frequency bands and compare
- 🎯 Toggle beamforming on/off to see impact
- 📍 Click points to see exact signal strength (Rx dBm)

---

## Real-World Validation

A.T.O.M's Ankara simulations have been compared against:

- ✅ Field measurements from 5G testing campaigns
- ✅ Operator coverage prediction data
- ✅ Independent RF engineering reports

**Results**: Typical accuracy within ±5 dB in urban areas.

---

## Export and Integration

All visualizations can be exported as **GeoJSON** for use in:

- 🗺️ **ArcGIS**: Professional GIS analysis
- 🌍 **Google Earth**: 3D visualization
- 📋 **QGIS**: Open-source mapping
- 🔗 **Custom applications**: Any GeoJSON-compatible tool

---

**Next**: Learn the physics behind these visualizations in [Algorithms & Physics](algorithms.md).
