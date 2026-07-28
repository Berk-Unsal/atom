# Contributing

A.T.O.M is an open-source project, and we welcome contributions from the community!

## How to Contribute

### Reporting Bugs

Found a bug? Please report it!

1. **Check existing issues** first: [GitHub Issues](https://github.com/Berk-Unsal/urban-ray-tracer/issues)
2. **Create new issue** if not already reported
3. **Include**:
   - OS and Docker version
   - Steps to reproduce
   - Expected vs actual behavior
   - Error logs/screenshots

**Example bug report**:

```markdown
## Bug: Simulation returns 500 error

### Environment
- Docker version: 24.0.0
- OS: macOS 14.0

### Steps to Reproduce
1. Run `docker run -p 8080:8080 atom-simulator`
2. POST to `/api/simulate` with an out-of-range payload
3. Receive 500 error

### Expected
- Graceful validation error that explains which request field is invalid

### Actual
- 500 Internal Server Error with no error message

### Logs
```
Server error: index out of bounds
```
```

### Suggesting Features

Want to suggest an improvement?

1. **Check existing proposals**: [Discussions](https://github.com/Berk-Unsal/urban-ray-tracer/discussions)
2. **Start a discussion** or open an issue labeled `enhancement`
3. **Describe**:
   - What problem it solves
   - Why it's valuable
   - Rough implementation approach (optional)

**Example feature request**:

```markdown
## Feature: Support for terrain elevation models

### Problem
RF propagation is affected by hills and valleys, but A.T.O.M currently ignores terrain.

### Proposal
- Add support for GeoTIFF elevation data
- Apply path loss adjustment based on elevation difference
- Include elevation visualization on map

### Benefits
- More accurate coverage prediction in mountainous regions
- Better antenna placement decisions

### Implementation hint
- Use open-source GDAL library for GeoTIFF reading
- Modify FSPL calculation in raytracer/geometry.go
```

---

## Contributing Code

### Setup Development Environment

**Backend**:

```bash
# Install Go 1.26+
cd backend-go
go mod download
go run .
```

**Frontend**:

```bash
# Install Node.js 24+
cd frontend-react
npm install
npm run dev
```

**Both together**:

```bash
# Terminal 1
cd backend-go && go run .

# Terminal 2
cd frontend-react && npm run dev

# Open http://localhost:5173
```

### Making Changes

#### Code Style

Follow standard Go and JavaScript conventions:

**Go**:
```go
// Use camelCase for functions/variables
func calculatePathLoss(distance float64) float64 {
    // Clear, concise comments
    return 20 * math.Log10(distance) - 27.55
}
```

**JavaScript**:
```javascript
// Use arrow functions, const/let
const calculateSignalStrength = (rxPower) => {
  return rxPower > -70 ? "excellent" : "poor";
};
```

#### Git Workflow

1. **Fork** repository
2. **Create feature branch**: `git checkout -b feature/new-feature`
3. **Make changes** (keep commits small and focused)
4. **Test** locally
5. **Push** to your fork
6. **Create Pull Request** with description

**Commit messages** (conventional format):

```
feat: add terrain elevation support
fix: correct FSPL calculation for 6G
docs: update API documentation
test: add raytracing unit tests
refactor: simplify optimization algorithm
```

### Testing

#### Go Backend Tests

```bash
cd backend-go
go test ./...
go test -cover ./...
```

**Add tests** for new features:

```go
func TestCalculatePathLoss(t *testing.T) {
    distance := 1000.0
    frequency := "5G"
    
    result := CalculatePathLoss(distance, frequency)
    
    // 5G at 1 km should be ~84 dB
    expected := 84.0
    if math.Abs(result - expected) > 1.0 {
        t.Fatalf("Expected %f, got %f", expected, result)
    }
}
```

#### React Frontend Tests

```bash
cd frontend-react
npm test
```

**Add tests** using Jest/React Testing Library:

```javascript
test('Azimuth slider updates coverage', () => {
  render(<ControlPanel />);
  const slider = screen.getByRole('slider', {name: /azimuth/i});
  
  fireEvent.change(slider, {target: {value: 90}});
  
  expect(slider.value).toBe('90');
});
```

### Code Review Checklist

Before submitting PR, verify:

- ✅ Code follows project style
- ✅ Tests pass: `go test ./...`
- ✅ No lint errors: `golint ./...`
- ✅ Comments explain "why", not "what"
- ✅ Commit messages are clear
- ✅ Documentation updated if needed
- ✅ No breaking changes (or documented)

---

## Documentation Contributions

### Improving Docs

Found a typo or unclear section? Help us improve!

1. **Edit markdown or HTML files** in the `docs/` folder
2. **Verify rendering**: Run `python3 -m http.server 9000 --directory docs`
3. **Submit PR** with changes

### Adding Examples

**Backend example** (Go):

```go
// In backend-go/examples/
package main

import (
    "fmt"
    raytracer "./raytracer"
)

func main() {
    // Example: Calculate path loss for 5G at 1 km
    loss := raytracer.CalculatePathLoss(1000, "5G")
    fmt.Printf("Path loss: %.2f dB\n", loss)
}
```

**Frontend example** (React):

```javascript
// In frontend-react/examples/
import { useSimulation } from '../hooks/useSimulation';

export function SimpleVisualization() {
  const { simulate } = useSimulation();
  
  const handleSimulate = async () => {
    const result = await simulate({
      tower_lon: 32.8541,
      tower_lat: 39.9208,
      rays: 120,
      radius_m: 400,
      frequency_ghz: 28,
      tx_power_dbm: 30,
      azimuth: 45,
      beam_width: 120
    });
    console.log('Coverage:', result);
  };
  
  return <button onClick={handleSimulate}>Simulate</button>;
}
```

---

## Priority Areas for Contributions

### High Priority

- 🔴 **Terrain elevation support**: Add GeoTIFF support
- 🔴 **Multipath modeling**: Include reflections
- 🔴 **Performance optimization**: Faster ray intersection testing
- 🔴 **Documentation**: More examples and tutorials

### Medium Priority

- 🟡 **Custom frequency bands**: User-defined frequencies
- 🟡 **Batch optimization**: Multi-site optimization
- 🟡 **Export formats**: Support more GIS formats
- 🟡 **Visualization enhancements**: 3D map view

### Low Priority

- 🟢 **UI polish**: Theme improvements, responsive design
- 🟢 **Internationalization**: Support other languages
- 🟢 **Mobile app**: React Native version
- 🟢 **Advanced analytics**: Statistical analysis tools

---

## Project Structure

```
urban-ray-tracer/
├── backend-go/          # Go backend (API, raytracing)
│   ├── main.go
│   ├── raytracer/       # RF propagation, spatial index, optimization
│   └── go.mod
├── frontend-react/      # React frontend (UI, visualization)
│   ├── src/
│   │   ├── components/  # React components
│   │   └── utils/       # Helpers (API calls, geometry)
│   └── package.json
├── data-pipeline/       # Data processing scripts
│   ├── extract_ankara.py
│   ├── fetch_buildings.py
│   ├── export_ankara_buildings.py
│   └── export_tower_geojson.py
└── docs/                # Static GitHub Pages documentation
    ├── index.html
    ├── changelog.html   # Generated from the root CHANGELOG.md
    └── ...
```

### Key Files to Know

| File | Purpose |
|------|---------|
| `backend-go/main.go` | API server entry point |
| `backend-go/raytracer/geometry.go` | RF physics calculations |
| `backend-go/raytracer/building_index.go` | R-Tree spatial index |
| `frontend-react/src/components/MapCanvas.jsx` | Leaflet map viewer |
| `frontend-react/src/utils/networkTech.js` | Frequency-specific constants |
| `Dockerfile` | Multi-stage build configuration |

---

## Deployment & Release Process

### Local Testing

```bash
# Build and test locally
docker build -t atom-simulator .
docker run -p 8080:8080 atom-simulator

# Run tests
cd backend-go && go test ./...
cd ../frontend-react && npm test
```

### Creating a Release

1. **Update version**: Edit version string in `main.go`
2. **Update CHANGELOG**: Document changes
3. **Create Git tag**: `git tag v1.1.0`
4. **Push tag**: `git push origin v1.1.0`
5. **Build release**: `docker build -t atom-simulator:1.1.0 .`
6. **Push to registry**: `docker push your-registry/atom-simulator:1.1.0`

---

## Communication

### Where to Ask Questions

- **GitHub Issues**: Bug reports, feature requests
- **GitHub Discussions**: Questions, brainstorming
- **Email**: [berk@berkunsal.com](mailto:berk@berkunsal.com)
- **LinkedIn**: [Berk Ünsal](https://linkedin.com/in/berkunsal)

### Code of Conduct

We're committed to providing a welcoming and inspiring community for all. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) (or establish community guidelines).

**TL;DR**: Be respectful, inclusive, and constructive.

---

## Contributor Recognition

All contributors will be:

- ✅ Added to [CONTRIBUTORS.md](CONTRIBUTORS.md)
- ✅ Credited in release notes
- ✅ Mentioned in documentation
- ✅ Eligible for maintainer status (after consistent contributions)

---

## Development Tools

### Recommended Extensions

**VS Code**:
- Go (golang.go)
- ES7+ React/Redux/React-Native snippets
- Docker
- GitLens
- Prettier

### Useful Commands

```bash
# Go formatting and linting
go fmt ./...
go vet ./...
golint ./...

# Go benchmarking
go test -bench=. -benchmem ./...

# React development
npm run build
npm run preview
npm run lint

# Docker cleanup
docker system prune -a
```

---

## Financial Contributions

If you'd like to support A.T.O.M financially:

- ⭐ Star the repository (recognition counts!)
- 🔗 Share with others in your network
- 💼 Consider consulting: [berk@berkunsal.com](mailto:berk@berkunsal.com)
- 🤝 Contribute code or documentation (priceless!)

---

## Getting Help

**Stuck? Need guidance?**

1. Check [FAQ](faq.md)
2. Search existing [GitHub Issues](https://github.com/Berk-Unsal/urban-ray-tracer/issues)
3. Review [Architecture](architecture.md) for system overview
4. Ask in GitHub Discussions
5. Reach out to maintainers

---

## Checklist for PRs

Before submitting:

- [ ] I've read [CONTRIBUTING.md](CONTRIBUTING.md)
- [ ] I've tested my changes locally
- [ ] I've added/updated documentation
- [ ] I've added tests for new features
- [ ] My code follows project style guidelines
- [ ] I've verified no breaking changes
- [ ] I've updated the CHANGELOG

---

Thank you for contributing to A.T.O.M! Together, we're building the future of RF simulation. 🚀

---

**Questions?** Open an issue or email [berk@berkunsal.com](mailto:berk@berkunsal.com)
