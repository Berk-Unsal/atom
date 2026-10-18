package raytracer

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func comparisonFixture(azimuthsA, azimuthsB [2]float64) (NetworkComparisonRequest, *BuildingIndex) {
	a, index := areaOfInterestFixture()
	b, _ := areaOfInterestFixture()
	for i := range a.Towers {
		a.Towers[i].AzimuthDeg = azimuthsA[i]
		b.Towers[i].AzimuthDeg = azimuthsB[i]
	}
	return NetworkComparisonRequest{A: a, B: b}, index
}

func TestNetworkComparisonReconcilesWithAggregateKPIs(t *testing.T) {
	cases := []struct {
		name string
		a, b [2]float64
	}{
		{"identical plans", [2]float64{90, 270}, [2]float64{90, 270}},
		{"both sectors turn east", [2]float64{90, 270}, [2]float64{90, 90}},
		{"sectors swap to face each other", [2]float64{90, 270}, [2]float64{0, 180}},
		{"reverse comparison", [2]float64{90, 90}, [2]float64{90, 270}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, index := comparisonFixture(tc.a, tc.b)
			result, err := CompareNetworksContext(context.Background(), req, index)
			if err != nil {
				t.Fatalf("compare: %v", err)
			}
			evaluatedA, err := EvaluateNetworkContext(context.Background(), req.A, index)
			if err != nil {
				t.Fatalf("evaluate a: %v", err)
			}
			evaluatedB, err := EvaluateNetworkContext(context.Background(), req.B, index)
			if err != nil {
				t.Fatalf("evaluate b: %v", err)
			}
			aggregates := result.Aggregates
			if aggregates.UniqueDemandBuildingsA != evaluatedA.Stats.UniqueDemandBuildings || aggregates.UniqueDemandBuildingsB != evaluatedB.Stats.UniqueDemandBuildings ||
				aggregates.OverlapBuildingsA != evaluatedA.Stats.OverlapBuildings || aggregates.OverlapBuildingsB != evaluatedB.Stats.OverlapBuildings {
				t.Fatalf("aggregates %+v differ from evaluate-network stats", aggregates)
			}
			counts := result.Counts
			if counts.NewlyServed-counts.NewlyLost != aggregates.UniqueDemandBuildingsB-aggregates.UniqueDemandBuildingsA {
				t.Fatalf("served delta %d-%d does not reconcile with %d-%d", counts.NewlyServed, counts.NewlyLost, aggregates.UniqueDemandBuildingsB, aggregates.UniqueDemandBuildingsA)
			}
			if counts.OverlapGained-counts.OverlapRemoved != aggregates.OverlapBuildingsB-aggregates.OverlapBuildingsA {
				t.Fatalf("overlap delta %d-%d does not reconcile with %d-%d", counts.OverlapGained, counts.OverlapRemoved, aggregates.OverlapBuildingsB, aggregates.OverlapBuildingsA)
			}
			if total := counts.NewlyServed + counts.NewlyLost + counts.OverlapGained + counts.OverlapRemoved; total != len(result.Buildings) {
				t.Fatalf("%d classified buildings, counts total %d", len(result.Buildings), total)
			}
			if tc.a == tc.b && len(result.Buildings) != 0 {
				t.Fatalf("identical plans produced deltas: %+v", result.Buildings)
			}
		})
	}
}

func TestNetworkComparisonFindsChangesAndIsDeterministic(t *testing.T) {
	req, index := comparisonFixture([2]float64{90, 270}, [2]float64{90, 90})
	first, err := CompareNetworksContext(context.Background(), req, index)
	if err != nil {
		t.Fatalf("compare: %v", err)
	}
	if first.Counts.NewlyLost == 0 {
		t.Fatalf("turning the west sector east should lose west demand buildings: %+v", first.Counts)
	}
	second, _ := CompareNetworksContext(context.Background(), req, index)
	left, _ := json.Marshal(first)
	right, _ := json.Marshal(second)
	if string(left) != string(right) {
		t.Fatal("comparison is not deterministic")
	}
	for index := 1; index < len(first.Buildings); index++ {
		if first.Buildings[index-1].ID > first.Buildings[index].ID {
			t.Fatal("buildings are not sorted by ID")
		}
	}
	if first.ScenarioFingerprintA == first.ScenarioFingerprintB {
		t.Fatal("different plans share a scenario fingerprint")
	}
}

func TestNetworkComparisonBuildingListIsBounded(t *testing.T) {
	changed := []NetworkComparisonBuilding{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	cases := []struct {
		name      string
		list      []NetworkComparisonBuilding
		limit     int
		want      int
		truncated bool
	}{
		{"under the limit", changed, 5, 3, false},
		{"at the limit", changed, 3, 3, false},
		{"over the limit", changed, 2, 2, true},
		{"nothing changed", nil, 2, 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			list, truncated := boundComparisonBuildings(tc.list, tc.limit)
			if len(list) != tc.want || truncated != tc.truncated || list == nil {
				t.Fatalf("bound = %d %v (nil=%v), want %d %v", len(list), truncated, list == nil, tc.want, tc.truncated)
			}
		})
	}
	// A full list with long IDs stays well inside a 1 MiB response.
	full := make([]NetworkComparisonBuilding, MaxNetworkComparisonBuildings)
	for index := range full {
		full[index] = NetworkComparisonBuilding{ID: fmt.Sprintf("way/%060d", index), Lon: -179.1234567, Lat: -89.1234567, Class: ComparisonOverlapRemoved}
	}
	encoded, _ := json.Marshal(NetworkComparisonResponse{Buildings: full, Classification: strings.Repeat("x", 200)})
	if len(encoded) > 1<<20 {
		t.Fatalf("bounded response is %d bytes", len(encoded))
	}
}
