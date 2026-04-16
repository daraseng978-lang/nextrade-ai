import { describe, it, expect } from "vitest";
import { PAGES } from "../engine/pages";

describe("page registry", () => {
  it("has the six required pages in canonical order", () => {
    expect(PAGES.map((p) => p.id)).toEqual([
      "desk",
      "charts",
      "control_center",
      "pine_studio",
      "journal",
      "settings",
    ]);
  });

  it("every page has a label and a one-sentence role", () => {
    for (const p of PAGES) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.role.length).toBeGreaterThan(8);
    }
  });
});
