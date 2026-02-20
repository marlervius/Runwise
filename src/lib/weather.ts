export interface WeatherData {
  temperature: number; // Celsius
  humidity: number; // %
  windSpeed: number; // m/s
  windDirection: number; // degrees
  weatherCode: number;
  condition: string;
}

// Map WMO weather codes to human readable conditions
const getWeatherCondition = (code: number): string => {
  if (code === 0) return '☀️ Clear sky';
  if (code === 1) return '🌤️ Mainly clear';
  if (code === 2) return '⛅ Partly cloudy';
  if (code === 3) return '☁️ Overcast';
  if (code >= 45 && code <= 48) return '🌫️ Foggy';
  if (code >= 51 && code <= 55) return '🌧️ Drizzle';
  if (code >= 61 && code <= 65) return '🌧️ Rain (light)';
  if (code >= 71 && code <= 75) return '🌧️ Snow (light)';
  if (code >= 80 && code <= 82) return '🌧️ Rain showers';
  if (code >= 85 && code <= 86) return '🌨️ Snow showers';
  if (code >= 95) return '⛈️ Thunderstorm';
  return 'Cloudy';
};

// Fetch historical weather for a specific time and place using Open-Meteo (Free, no API key needed)
export const getHistoricalWeather = async (
  lat: number, 
  lng: number, 
  timestamp: string // ISO string
): Promise<WeatherData | null> => {
  try {
    const date = new Date(timestamp);
    // Format to YYYY-MM-DD for the API
    const dateStr = date.toISOString().split('T')[0];
    // Get the hour (0-23) to pick the right hourly forecast
    const hourIndex = date.getHours();

    // Call the Historical API (if older than a week) or Forecast API (if recent)
    // Open-Meteo's unified API endpoint
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&start_date=${dateStr}&end_date=${dateStr}`;

    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;

    const data = await res.json();
    
    // Safety check
    if (!data.hourly || data.hourly.temperature_2m.length <= hourIndex) {
      return null;
    }

    const temp = data.hourly.temperature_2m[hourIndex];
    const humidity = data.hourly.relative_humidity_2m[hourIndex];
    // Convert km/h to m/s for wind speed (Strava users prefer m/s or km/h, let's keep m/s for consistency)
    const windSpeedKmH = data.hourly.wind_speed_10m[hourIndex];
    const windSpeedMs = windSpeedKmH / 3.6;
    const windDir = data.hourly.wind_direction_10m[hourIndex];
    const code = data.hourly.weather_code[hourIndex];

    return {
      temperature: temp,
      humidity: humidity,
      windSpeed: windSpeedMs,
      windDirection: windDir,
      weatherCode: code,
      condition: getWeatherCondition(code)
    };
  } catch (err) {
    console.error("Failed to fetch weather data:", err);
    return null;
  }
};