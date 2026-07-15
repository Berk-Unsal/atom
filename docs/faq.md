# FAQ (Frequently Asked Questions)

## General Questions

### What is A.T.O.M used for?

A.T.O.M simulates cellular network coverage and optimizes antenna placement for RF engineers planning 4G/5G/6G networks in urban areas. It's used by network operators, equipment vendors, and telecom researchers.

### Is A.T.O.M free?

Yes! A.T.O.M is open-source under the MIT license. You can use, modify, and redistribute it freely.

### What frequency bands does A.T.O.M support?

- **4G LTE**: 2.6 GHz
- **5G mmWave**: 28 GHz
- **6G Sub-THz**: 140 GHz

You can add custom frequencies by modifying the backend code.

### Can I use A.T.O.M for my city instead of Ankara?

Yes! A.T.O.M is designed to work with any city. You need:

1. Building geometries in GeoJSON format (from OpenStreetMap)
2. Tower/node locations as GeoJSON points
3. Replace data files in `data-pipeline/`

See [Getting Started](getting-started.md) for data pipeline instructions.

---

## Technical Questions

### How accurate is A.T.O.M?

A.T.O.M has not been calibrated against operator drive tests or UE measurements. It produces deterministic planning estimates whose usefulness depends on:

- ✅ OSM building data quality
- The fixed frequency-dependent wall-loss assumptions
- ✅ Tower coordinates
- Terrain elevation, reflections, and fading are not currently modeled

Use it to compare planning scenarios, then validate deployment decisions with calibrated tools and field measurements.

### Why doesn't A.T.O.M model multipath/reflections?

Including full multipath (reflections, scattering) would:

1. Increase computation time by 100-1000×
2. Require ray bounce limits to be practical
3. Add uncertainty about reflection coefficients

A.T.O.M focuses on **deterministic propagation** (line-of-sight + penetration losses) which is sufficient for coverage planning.

### Can I add custom propagation models?

Yes! Edit `backend-go/raytracer/geometry.go`:

```go
func CustomPathLoss(distance float64, frequency string) float64 {
    // Your custom equation
    return 20*math.Log10(distance) + customFactor
}
```

Rebuild and redeploy:

```bash
docker build -t atom-simulator .
```

### How does the R-Tree spatial index work?

See [Algorithms & Physics](algorithms.md#spatial-indexing-r-tree) for detailed explanation.

**TL;DR**: It's a balanced tree structure that speeds up "which buildings does this ray intersect?" queries from O(n) → O(log n).

### What if a building is not in OSM?

Add it to OpenStreetMap! OSM is community-maintained, so:

1. Visit [openstreetmap.org](https://www.openstreetmap.org)
2. Edit map to add missing building
3. Re-export data using data pipeline
4. Rebuild simulator

### Can I run A.T.O.M offline?

Yes! Once the Docker image is built, it needs no external internet access. All data is baked into the image.

---

## Performance Questions

### Why is the first request slow?

The first request triggers:
1. Docker startup
2. GeoJSON loading
3. R-Tree construction
4. Simulation execution

**Typical**: 5-10 seconds total (future requests: 1-3 seconds)

### How many concurrent requests can A.T.O.M handle?

Depends on your hardware:

| CPU Cores | Max Concurrent | Notes |
|-----------|----------------|-------|
| 1 | 2 | Development only |
| 2 | 5 | Small deployments |
| 4 | 15 | Recommended |
| 8 | 30 | Enterprise |

### How can I make simulations faster?

1. **Reduce ray count**: Fewer rays means fewer intersection checks
2. **Reduce coverage radius**: Shorter max distance means fewer segment steps
3. **Deploy on faster CPU**: More cores = faster execution
4. **Parallelize**: Use batch optimization

### What's the memory footprint?

| Component | Size |
|-----------|------|
| Go runtime | ~10 MB |
| Building GeoJSON | 40 MB (compressed in RAM) |
| R-Tree | 150 MB |
| Workspace per request | 5 MB |
| **Total** | ~200 MB typical |

Docker container: **~150 MB**

---

## Deployment Questions

### Can I run A.T.O.M on ARM64 (Apple Silicon)?

Yes! The Docker image builds for ARM64. Just build and run normally:

```bash
docker build -t atom-simulator .
docker run -p 8080:8080 atom-simulator
```

### How do I update A.T.O.M?

1. Pull latest code: `git pull`
2. Rebuild image: `docker build -t atom-simulator .`
3. Stop old container: `docker stop atom-api`
4. Run new container: `docker run -p 8080:8080 atom-simulator`

### Can I deploy multiple replicas?

Yes! A.T.O.M is **stateless**, so multiple instances can run behind a load balancer. See [Deployment](deployment.md#horizontal-scaling-multiple-instances).

### What's the difference between Docker and native Go?

| Aspect | Docker | Native Go |
|--------|--------|-----------|
| Isolation | ✅ Full OS isolation | ❌ None |
| Setup | 1 command | Requires Go, Node.js |
| Performance | ~5% overhead | Baseline |
| Portability | ✅ Works anywhere | ❌ OS-specific |
| Recommended | ✅ Yes (all environments) | Development only |

---

## Data Questions

### Where does the GeoJSON data come from?

- **Buildings**: [OpenStreetMap](https://www.openstreetmap.org)
- **Towers**: [OpenCellID](https://opencellid.org)
- **Custom data**: You can add your own

### Can I add a new building to the map?

Yes! Edit OpenStreetMap, re-export data, rebuild simulator. See [Getting Started](getting-started.md#data-pipeline-optional).

### How often should I update the data?

- **GeoJSON**: Every quarter (as OSM updates)
- **Tower list**: Monthly (new sites come online)
- **Material database**: Annually (as building codes change)

### Can I use proprietary building data?

Yes, A.T.O.M accepts any GeoJSON-format geometry. Replace:
- `data-pipeline/ankara_buildings.geojson`
- `data-pipeline/ankara_5g_nodes.geojson`

Then rebuild.

---

## API Questions

### What's the typical API response time?

| Request | Time |
|---------|------|
| `/healthz` | < 10 ms |
| `/api/towers` | 100 ms |
| `/api/buildings` | 1-2 seconds |
| `/api/simulate` | 1-3 seconds |
| `/api/coverage-gaps` | 1-3 seconds |
| `/api/optimize-azimuth` | 3-5 seconds |

### Can I call the API from my own application?

Yes! A.T.O.M exposes a REST API. Examples:

```python
import requests

response = requests.post(
    'http://localhost:8080/api/simulate',
    json={
        'tower_lon': 32.8541,
        'tower_lat': 39.9208,
        'rays': 120,
        'radius_m': 400,
        'frequency_ghz': 28,
        'tx_power_dbm': 30,
        'azimuth': 45,
        'beam_width': 120
    }
)

coverage = response.json()['geojson']
```

See [API Reference](api.md) for full documentation.

### Does A.T.O.M support webhooks?

Not in v1.0. Planned for v1.1+. Currently, poll the API for results.

---

## Integration Questions

### Can I export results to ArcGIS/QGIS?

Yes! All results are GeoJSON-formatted. Simply:

1. Export from A.T.O.M: Click "Download GeoJSON"
2. Import into ArcGIS: File → Import → GeoJSON
3. Use in QGIS: Layer → Add Layer → Vector → GeoJSON

### Can I integrate A.T.O.M with my network planning tool?

Yes! Call the REST API from your tool. See [API Reference](api.md) for endpoints and examples.

### Does A.T.O.M work with Optus, Ericsson, or Nokia planning tools?

Not directly, but you can:
1. Export GeoJSON from A.T.O.M
2. Convert to your tool's format (usually via QGIS)
3. Import for comparison/validation

---

## Troubleshooting Questions

### Docker image won't build

**Error**: `npm: not found`

**Solution**: Ensure Dockerfile is complete. Download latest from GitHub:

```bash
git clone https://github.com/your-org/A.T.O.M.git
cd urban-ray-tracer
docker build -t atom-simulator .
```

### API returns validation error

**Cause**: One of the request fields is outside the allowed range or missing

**Solution**: 
1. Check the current payload keys in [API Reference](api.md)
2. Verify `tower_lon`, `tower_lat`, `rays`, `radius_m`, and `frequency_ghz`

### Coverage heatmap looks wrong

**Possible causes**:
1. ❌ Building data corrupted → Check OSM data quality
2. ❌ Frequency range too wide → Adjust grid spacing
3. ❌ Beamforming gain off → Check beam width setting

**Debug**: Call `/readyz` to verify the building index, tower data, and frontend bundle are loaded. Use `/healthz` only to check process liveness.

### Why is my region's coverage very sparse?

**Possible causes**:
1. **Data quality**: Missing buildings in OSM
2. **Frequency too high**: 6G has very limited range
3. **Line-of-sight**: If urban canyon is dense, coverage naturally limited

**Solution**: Add missing buildings to OSM, or choose more favorable tower location.

---

## Contributing Questions

### How can I contribute to A.T.O.M?

See [Contributing](contributing.md) for guidelines.

### Can I fork A.T.O.M for my own project?

Yes! MIT license allows forking. You must:
- ✅ Include original license
- ✅ Attribute original authors
- ✅ Document your modifications

### Who maintains A.T.O.M?

A.T.O.M is maintained by [Berk Ünsal](https://berkunsal.com) with community contributions.

---

## Licensing Questions

### What license is A.T.O.M under?

MIT License (open-source, permissive)

### Can I use A.T.O.M commercially?

Yes! MIT license allows commercial use. Just include the license in your distribution.

### Do I need to contribute improvements back?

Not required, but encouraged! Community contributions improve the project for everyone.

---

## Still have questions?

- 📖 Check [Documentation](index.md) 
- 💬 Open an issue on GitHub
- 📧 Email [berk@berkunsal.com](mailto:berk@berkunsal.com)

---

**Next**: See [Contributing](contributing.md) to help improve A.T.O.M.
