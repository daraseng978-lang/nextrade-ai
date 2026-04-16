import type { PageMeta } from "./types";

export const PAGES: PageMeta[] = [
  { id: "desk", label: "Desk", role: "Best trade right now · why · what to do." },
  { id: "charts", label: "Charts", role: "Multi-timeframe market view + selected setup overlay." },
  { id: "control_center", label: "Control Center", role: "System health, agents, approvals, route safety." },
  { id: "pine_studio", label: "Pine Studio", role: "Selected playbook → day-specific Pine + alerts." },
  { id: "journal", label: "Journal", role: "Completed trades, performance, calibration." },
  { id: "settings", label: "Settings", role: "Account, risk, prop-firm, kill switch, feed." },
];
