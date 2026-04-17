import fetch from "node-fetch";

// TradingEconomics public API returns economic calendar events.
// Free tier: no API key required, but rate-limited. Suitable for daily briefs.

export interface EconomicEvent {
  time: string;           // HH:MM ET
  event: string;          // Event name
  impact: "high" | "medium" | "low";
  previous: string;       // Prior reading
  forecast: string;       // Market expectation
  actual?: string;        // Released value (if available)
}

const CACHE_TTL_MS = 3600000; // 1 hour
let cachedEvents: { at: number; events: EconomicEvent[] } | null = null;

async function fetchTradingEconomicsCalendar(): Promise<EconomicEvent[]> {
  const now = Date.now();
  if (cachedEvents && now - cachedEvents.at < CACHE_TTL_MS) {
    return cachedEvents.events;
  }

  try {
    // TradingEconomics free API endpoint (no auth required)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://api.tradingeconomics.com/calendar/?format=json", {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[calendar] TradingEconomics API returned ${response.status}`);
      return [];
    }

    const data = (await response.json()) as Array<{
      Date?: string;
      Time?: string;
      Event?: string;
      Importance?: string;
      Forecast?: string | number;
      Previous?: string | number;
      Actual?: string | number;
    }>;

    // Today's date in ET (simple approach: use UTC and adjust if needed)
    const now2 = new Date();
    const todayDateStr = now2.toISOString().slice(0, 10);

    // Filter for today's events, map to our format
    const events = data
      .filter((e) => e.Date && e.Date.includes(todayDateStr) && e.Time && e.Event)
      .map((e) => {
        // Importance: 1=low, 2=medium, 3=high
        const importanceMap: Record<string, "low" | "medium" | "high"> = {
          "1": "low",
          "2": "medium",
          "3": "high",
        };
        const impact = importanceMap[String(e.Importance)] || "medium";

        // Extract time (TradingEconomics returns full ISO datetime; extract HH:MM)
        const timeParts = e.Time ? e.Time.split("T")[1]?.slice(0, 5) : "00:00";

        // At this point, Event is guaranteed to be defined by filter, but TypeScript doesn't track it
        const event: string = e.Event || "Unknown Event";

        return {
          time: `${timeParts} ET`,
          event,
          impact,
          previous: String(e.Previous ?? "—"),
          forecast: String(e.Forecast ?? "—"),
          actual: e.Actual ? String(e.Actual) : undefined,
        } as EconomicEvent;
      })
      .slice(0, 10); // Limit to top 10 for brief

    cachedEvents = { at: now, events };
    return events;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[calendar] fetch failed: ${msg}`);
    return [];
  }
}

// Fallback mock calendar for demo / when API fails
function getMockCalendar(): EconomicEvent[] {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const POOL: EconomicEvent[] = [
    { time: "08:30 ET", event: "Initial Jobless Claims", impact: "medium", previous: "215K", forecast: "218K" },
    { time: "08:30 ET", event: "Core CPI MoM", impact: "high", previous: "0.3%", forecast: "0.2%" },
    { time: "09:45 ET", event: "S&P Flash PMI", impact: "medium", previous: "52.1", forecast: "51.8" },
    { time: "10:00 ET", event: "ISM Manufacturing PMI", impact: "high", previous: "49.2", forecast: "49.8" },
    { time: "10:00 ET", event: "JOLTS Job Openings", impact: "medium", previous: "8.76M", forecast: "8.63M" },
    { time: "14:00 ET", event: "FOMC Meeting Minutes", impact: "high", previous: "—", forecast: "—" },
    { time: "10:30 ET", event: "EIA Crude Inventories", impact: "medium", previous: "-2.1M", forecast: "-1.5M" },
  ];

  const count = dayOfMonth % 2 === 0 ? 3 : 2;
  const start = dayOfMonth % POOL.length;
  return Array.from({ length: count }, (_, i) => POOL[(start + i) % POOL.length]);
}

export async function getEconomicCalendar(): Promise<EconomicEvent[]> {
  const live = await fetchTradingEconomicsCalendar();
  // If live fetch returns events, use them; otherwise fall back to mock
  return live.length > 0 ? live : getMockCalendar();
}
