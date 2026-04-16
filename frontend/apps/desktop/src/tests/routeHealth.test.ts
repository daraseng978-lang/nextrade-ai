import { describe, it, expect } from "vitest";
import { buildMockRouteHealth } from "../engine/routeHealth";

describe("route health", () => {
  it("returns OK for both routes when kill switch is off", () => {
    const r = buildMockRouteHealth(false);
    expect(r.tradersPost.status).toBe("ok");
    expect(r.tradovate.status).toBe("ok");
  });

  it("flips to degraded when kill switch is engaged", () => {
    const r = buildMockRouteHealth(true);
    expect(r.tradersPost.status).toBe("degraded");
    expect(r.tradovate.status).toBe("degraded");
  });

  it("always carries an ISO timestamp and human note", () => {
    const r = buildMockRouteHealth(false);
    for (const route of [r.tradersPost, r.tradovate]) {
      expect(typeof route.lastCheck).toBe("string");
      expect(new Date(route.lastCheck).toString()).not.toBe("Invalid Date");
      expect(route.note.length).toBeGreaterThan(0);
    }
  });
});
