import type { RouteHealth } from "./types";

// Mock route health. In a live build this is fed by the integration
// agents (TradersPost / Tradovate). For now we surface a deterministic
// "mock · ready" state with a current timestamp so the Control Center
// has something honest to render.
export function buildMockRouteHealth(killSwitch: boolean): RouteHealth {
  const now = new Date().toISOString();
  if (killSwitch) {
    return {
      tradersPost: { status: "degraded", lastCheck: now, note: "Routing paused (kill switch engaged)." },
      tradovate: { status: "degraded", lastCheck: now, note: "Routing paused (kill switch engaged)." },
    };
  }
  return {
    tradersPost: { status: "ok", lastCheck: now, note: "Mock connection — accepts payloads." },
    tradovate: { status: "ok", lastCheck: now, note: "Mock connection — accepts orders." },
  };
}
