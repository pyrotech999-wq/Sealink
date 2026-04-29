/** Short label for WMO Weather interpretation codes (Open-Meteo). */
export function wmoWeatherLabel(code: number): string {
  const c = Math.round(code);
  if (c === 0) return "Clear sky";
  if (c === 1) return "Mainly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Overcast";
  if (c === 45 || c === 48) return "Fog";
  if (c === 51 || c === 53 || c === 55) return "Drizzle";
  if (c === 56 || c === 57) return "Freezing drizzle";
  if (c === 61 || c === 63 || c === 65) return "Rain";
  if (c === 66 || c === 67) return "Freezing rain";
  if (c === 71 || c === 73 || c === 75) return "Snow fall";
  if (c === 77) return "Snow grains";
  if (c === 80 || c === 81 || c === 82) return "Rain showers";
  if (c === 85 || c === 86) return "Snow showers";
  if (c === 95) return "Thunderstorm";
  if (c === 96 || c === 99) return "Thunderstorm with hail";
  return "Mixed conditions";
}

export function wmoWeatherEmoji(code: number): string {
  const c = Math.round(code);
  if (c === 0) return "☀️";
  if (c === 1) return "🌤️";
  if (c === 2) return "⛅";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if (c >= 51 && c <= 67) return "🌧️";
  if (c >= 71 && c <= 77) return "❄️";
  if (c >= 80 && c <= 82) return "🌦️";
  if (c === 85 || c === 86) return "🌨️";
  if (c >= 95) return "⛈️";
  return "🌡️";
}
