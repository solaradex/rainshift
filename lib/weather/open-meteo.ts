export type OpenMeteoDay = {
  date: string;
  rainProbability: number;
  rainInches: number;
};

type ForecastResponse = {
  timezone: string;
  hourly: {
    time: string[];
    precipitation_probability?: number[];
    rain?: number[];
  };
};

function max(values: number[]) {
  return values.length ? Math.max(...values) : 0;
}

export async function getDailyRainForecast(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  timezone: string
): Promise<OpenMeteoDay[]> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "precipitation_probability,rain",
    timezone,
    start_date: startDate,
    end_date: endDate,
  });

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Weather provider returned ${response.status}: ${details}`);
  }

  const data = (await response.json()) as ForecastResponse;
  const days = new Map<string, { probability: number[]; rainMm: number[] }>();

  for (let i = 0; i < data.hourly.time.length; i++) {
    const date = data.hourly.time[i].slice(0, 10);
    const hour = Number(data.hourly.time[i].slice(11, 13));

    if (hour < 6 || hour > 19) continue;

    const entry = days.get(date) ?? { probability: [], rainMm: [] };
    entry.probability.push(data.hourly.precipitation_probability?.[i] ?? 0);
    entry.rainMm.push(data.hourly.rain?.[i] ?? 0);
    days.set(date, entry);
  }

  return [...days.entries()].map(([date, values]) => ({
    date,
    rainProbability: Math.round(max(values.probability)),
    rainInches: Number(
      (values.rainMm.reduce((sum, value) => sum + value, 0) / 25.4).toFixed(2)
    ),
  }));
}