package raytracer

import (
	"context"
	"math"
)

func SegmentPolygonFirstIntersection(a Point, b Point, polygon []Point) (bool, Point) {
	if len(polygon) < 3 {
		return false, Point{}
	}
	if PointInPolygon(a, polygon) {
		return true, a
	}

	found := false
	closestPoint := Point{}
	closestDistance := math.Inf(1)
	for index := range polygon {
		next := (index + 1) % len(polygon)
		hit, point := SegmentIntersectionPoint(a, b, polygon[index], polygon[next])
		if !hit {
			continue
		}
		distance := ApproxDistanceMeters(a, point)
		if distance < closestDistance {
			closestDistance = distance
			closestPoint = point
			found = true
		}
	}
	return found, closestPoint
}

func SegmentPolygonIntersections(a Point, b Point, polygon []Point) []Point {
	points, _ := segmentPolygonIntersectionsContext(context.Background(), a, b, polygon)
	return points
}

func segmentPolygonIntersectionsContext(ctx context.Context, a Point, b Point, polygon []Point) ([]Point, error) {
	if len(polygon) < 3 {
		return nil, nil
	}
	points := make([]Point, 0, 2)
	for index := range polygon {
		if index%64 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		next := (index + 1) % len(polygon)
		hit, point := SegmentIntersectionPoint(a, b, polygon[index], polygon[next])
		if hit {
			points = appendUniquePoint(points, point)
		}
	}
	return points, nil
}

func appendUniquePoint(points []Point, candidate Point) []Point {
	for _, existing := range points {
		if ApproxDistanceMeters(existing, candidate) <= 0.05 {
			return points
		}
	}
	return append(points, candidate)
}

func SegmentIntersectionPoint(p1 Point, p2 Point, q1 Point, q2 Point) (bool, Point) {
	x1, y1 := p1.Lon, p1.Lat
	x2, y2 := p2.Lon, p2.Lat
	x3, y3 := q1.Lon, q1.Lat
	x4, y4 := q2.Lon, q2.Lat
	denominator := (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
	if math.Abs(denominator) < 1e-14 {
		return false, Point{}
	}
	t := ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denominator
	u := -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denominator
	if t < 0 || t > 1 || u < 0 || u > 1 {
		return false, Point{}
	}
	return true, Point{Lon: x1 + t*(x2-x1), Lat: y1 + t*(y2-y1)}
}
