package raytracer

import (
	_ "embed"
	"encoding/json"
	"math"
	"testing"
)

//go:embed testdata/diffraction-reference-fixtures.json
var diffractionReferenceFixtureBytes []byte

type diffractionReferenceCorpus struct {
	SchemaVersion    int                          `json:"schema_version"`
	CorpusID         string                       `json:"corpus_id"`
	Reference        string                       `json:"reference"`
	LossConvention   string                       `json:"loss_convention"`
	Assumptions      []string                     `json:"assumptions"`
	DirectVFixtures  []diffractionVFixture        `json:"direct_v_fixtures"`
	GeometryFixtures []diffractionGeometryFixture `json:"geometry_fixtures"`
}

type diffractionVFixture struct {
	ID             string  `json:"id"`
	V              float64 `json:"v"`
	ExpectedLossDB float64 `json:"expected_loss_db"`
	Tolerance      float64 `json:"tolerance"`
	Provenance     string  `json:"provenance"`
}

type diffractionGeometryFixture struct {
	ID              string  `json:"id"`
	FrequencyGHz    float64 `json:"frequency_ghz"`
	HeightAboveLOSM float64 `json:"height_above_los_m"`
	D1M             float64 `json:"d1_m"`
	D2M             float64 `json:"d2_m"`
	ExpectedV       float64 `json:"expected_v"`
	ExpectedLossDB  float64 `json:"expected_loss_db"`
	Tolerance       float64 `json:"tolerance"`
	Provenance      string  `json:"provenance"`
}

func loadDiffractionReferenceCorpus(t *testing.T) diffractionReferenceCorpus {
	t.Helper()
	var corpus diffractionReferenceCorpus
	if err := json.Unmarshal(diffractionReferenceFixtureBytes, &corpus); err != nil {
		t.Fatalf("decode diffraction reference fixtures: %v", err)
	}
	return corpus
}

func TestP526SingleEdgeReferenceFixturesAreIndependent(t *testing.T) {
	corpus := loadDiffractionReferenceCorpus(t)
	if corpus.SchemaVersion != 1 || corpus.CorpusID != "p526-single-edge-diagnostic-v1" || corpus.Reference == "" || corpus.LossConvention == "" || len(corpus.Assumptions) < 3 {
		t.Fatalf("incomplete diffraction reference metadata: %+v", corpus)
	}
	if len(corpus.DirectVFixtures) < 5 || len(corpus.GeometryFixtures) < 4 {
		t.Fatalf("reference fixture coverage is incomplete: direct=%d geometry=%d", len(corpus.DirectVFixtures), len(corpus.GeometryFixtures))
	}
	for _, fixture := range corpus.DirectVFixtures {
		fixture := fixture
		t.Run(fixture.ID, func(t *testing.T) {
			if fixture.Provenance == "" {
				t.Fatalf("fixture is missing provenance")
			}
			if loss := KnifeEdgeLossForV(fixture.V); math.Abs(loss-fixture.ExpectedLossDB) > fixture.Tolerance {
				t.Fatalf("loss = %.12f, want %.12f ± %.12f", loss, fixture.ExpectedLossDB, fixture.Tolerance)
			}
		})
	}
	for _, fixture := range corpus.GeometryFixtures {
		fixture := fixture
		t.Run(fixture.ID, func(t *testing.T) {
			if fixture.Provenance == "" {
				t.Fatalf("fixture is missing provenance")
			}
			v, ok := KnifeEdgeV(fixture.HeightAboveLOSM, fixture.D1M, fixture.D2M, fixture.FrequencyGHz)
			if !ok || math.Abs(v-fixture.ExpectedV) > fixture.Tolerance {
				t.Fatalf("v = %.12f, want %.12f ± %.12f", v, fixture.ExpectedV, fixture.Tolerance)
			}
			if loss := KnifeEdgeLossForV(v); math.Abs(loss-fixture.ExpectedLossDB) > fixture.Tolerance {
				t.Fatalf("loss = %.12f, want %.12f ± %.12f", loss, fixture.ExpectedLossDB, fixture.Tolerance)
			}
			if loss := KnifeEdgeLossDB(fixture.HeightAboveLOSM, fixture.D1M, fixture.D2M, fixture.FrequencyGHz); math.Abs(loss-fixture.ExpectedLossDB) > fixture.Tolerance {
				t.Fatalf("public helper loss = %.12f, want %.12f ± %.12f", loss, fixture.ExpectedLossDB, fixture.Tolerance)
			}
		})
	}
}

func TestP526SingleEdgeInvalidGeometryIsUnavailable(t *testing.T) {
	for _, values := range [][4]float64{{1, 0, 10, 2.6}, {1, 10, 0, 2.6}, {1, 10, 10, 0}} {
		if _, ok := KnifeEdgeV(values[0], values[1], values[2], values[3]); ok {
			t.Fatalf("invalid geometry unexpectedly produced v for %+v", values)
		}
	}
}
