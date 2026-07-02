export function rxPowerColor(receivedPowerDbm) {
  if (receivedPowerDbm >= -85) {
    return "#10b981";
  }
  if (receivedPowerDbm >= -105) {
    return "#f59e0b";
  }
  return "#e11d48";
}
