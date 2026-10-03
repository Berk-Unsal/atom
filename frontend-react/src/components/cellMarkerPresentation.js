// Presentation only. All rings and the order label share the Cell's geographic center.
export function cellMarkerPresentation({ active = false, selected = false, inspected = false, focused = false, order = null, zoom = 14 } = {}) {
  const rings = [];
  if (active) rings.push({ state: "active", radius: selected ? 14 : 10, pathOptions: { color: "#0f766e", weight: 3, fill: false, opacity: 1 } });
  if (focused) rings.push({ state: "focused", radius: active ? 18 : 14, pathOptions: { color: "#52615a", weight: 2, fill: false, dashArray: "3 3" } });
  if (inspected) rings.push({ state: "inspected", radius: focused ? 22 : active ? 18 : 14, pathOptions: { color: "#1f2937", weight: 2, fill: false } });
  return {
    // Preserve the original available-Cell hit area as its visible circle shrinks.
    hitRadius: selected || active || focused ? 10 : inspected ? 7 : 6,
    radius: selected ? 10 : active || inspected || focused ? 6 : zoom <= 12 ? 3 : zoom <= 14 ? 4 : 5,
    pathOptions: {
      color: selected ? "#c55a11" : active ? "#0f766e" : "#447bb0",
      fillColor: selected ? "#fff3e7" : active ? "#ffffff" : "#9ec2e2",
      weight: selected || active ? 2 : 1,
      fillOpacity: selected || active || inspected || focused ? 1 : 0.6,
      opacity: selected || active || inspected || focused ? 1 : 0.7,
    },
    rings,
    order: Number.isInteger(Number(order)) && Number(order) > 0 ? Number(order) : null,
  };
}
