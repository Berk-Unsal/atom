import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import BasemapLayer from "./BasemapLayer.jsx";
import { getBasemap } from "./basemaps.js";

vi.mock("react-leaflet", () => ({
  TileLayer: ({ className, url, attribution, maxZoom, opacity, eventHandlers }) => (
    <button className={className} data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} data-opacity={opacity} onClick={eventHandlers.tileerror}>Tile error</button>
  ),
}));

it("makes provider errors observable and resets failure when the provider changes", () => {
  const { rerender } = render(<BasemapLayer basemap={getBasemap("alidade-smooth")} />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("status")).toHaveTextContent("choose OpenStreetMap in Layers");
  expect(screen.getByRole("button")).toHaveAttribute("data-opacity", "0");
  rerender(<BasemapLayer basemap={getBasemap("osm-standard")} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("button")).toHaveAttribute("data-opacity", "1");
  expect(screen.getByRole("button")).toHaveClass("atom-basemap-osm");
});
