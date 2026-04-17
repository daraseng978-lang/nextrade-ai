import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  AccountRiskConfig,
  EventEntry,
  ExecutionState,
  InstrumentContext,
  PropFirmControl,
  RouteHealth,
  SelectedSignal,
  TimeframeId,
  WorkstationPage,
} from "../engine/types";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";
import { buildPropFirmControl } from "../engine/propFirm";
import { DEFAULT_QUAD_TIMEFRAMES, type ChartFeedMode } from "../engine/tradingView";
import { buildMockRouteHealth } from "../engine/routeHealth";
import {
  buildPreMarketBrief,
  enrichContextsWithBrief,
  type PreMarketBrief,
} from "../engine/preMarketChecklist";
import { STRATEGIES } from "../engine/strategies";
import type { JournalEntry } from "../engine/journal";

export type { JournalEntry } from "../engine/journal";

export type ChartViewMode = "quad" | "focus";

interface WorkstationState {
  contexts: InstrumentContext[];
  signals: Record<string, SelectedSignal>;
  selectedSymbol: string;
  selected: SelectedSignal;
  account: AccountRiskConfig;
  killSwitch: boolean;
  quorumEnabled: boolean;
  setSelectedSymbol: (symbol: string) => void;
  setKillSwitch: (v: boolean) => void;
  setQuorumEnabled: (v: boolean) => void;
  setAccount: (cfg: AccountRiskConfig) => void;

  journal: JournalEntry[];
  logExecution: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, patch: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;

  page: WorkstationPage;
  setPage: (p: WorkstationPage) => void;

  chartViewMode: ChartViewMode;
  setChartViewMode: (m: ChartViewMode) => void;
  focusTimeframe: TimeframeId;
  setFocusTimeframe: (tf: TimeframeId) => void;
  chartTimeframes: TimeframeId[];
  setChartTimeframes: (tfs: TimeframeId[]) => void;
  chartFeedMode: ChartFeedMode;
  setChartFeedMode: (m: ChartFeedMode) => void;

  // Per-cell chart unavailability — keyed by `${symbol}:${tf}`.
  chartUnavailable: Record<string, string>; // value = current symbol that failed
  markChartUnavailable: (key: string, symbol: string) => void;
  clearChartUnavailable: (key: string) => void;

  executionState: ExecutionState;
  approve: () => void;
  send: () => void;
  resetWorkflow: () => void;

  propFirm: PropFirmControl;
  routeHealth: RouteHealth;
  events: EventEntry[];
  pushEvent: (entry: Omit<EventEntry, "id" | "timestamp">) => void;
  preMarketBrief: PreMarketBrief;
}

const JOURNAL_STORAGE_KEY = "nextrade.journal.v1";

function loadPersistedJournal(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistJournal(journal: JournalEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journal));
  } catch { /* quota or private mode — ignore */ }
}

const Ctx = createContext<WorkstationState | null>(null);

export function WorkstationProvider({ children }: PropsWithChildren) {
  const [contexts] = useState(mockContexts);
  const [killSwitchForBrief, setKillSwitchForBrief] = useState(false);
  const preMarketBrief = useMemo(
    () => buildPreMarketBrief(contexts, killSwitchForBrief),
    [contexts, killSwitchForBrief],
  );
  const enrichedContexts = useMemo(
    () => enrichContextsWithBrief(contexts, preMarketBrief),
    [contexts, preMarketBrief],
  );
  const [selectedSymbol, setSelectedSymbolRaw] = useState<string>(
    contexts[0]?.instrument.symbol ?? "MES",
  );
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [killSwitch, setKillSwitchRaw] = useState(false);
  const [quorumEnabled, setQuorumEnabledRaw] = useState(false);
  const [journal, setJournal] = useState<JournalEntry[]>(loadPersistedJournal);

  // Persist journal changes to localStorage whenever it changes
  useEffect(() => { persistJournal(journal); }, [journal]);

  const [page, setPage] = useState<WorkstationPage>("desk");
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("quad");
  const [focusTimeframe, setFocusTimeframe] = useState<TimeframeId>("5");
  const [chartTimeframes, setChartTimeframes] = useState<TimeframeId[]>(DEFAULT_QUAD_TIMEFRAMES);
  const [chartFeedMode, setChartFeedMode] = useState<ChartFeedMode>("proxy");
  const [chartUnavailable, setChartUnavailable] = useState<Record<string, string>>({});

  const [executionState, setExecutionState] = useState<ExecutionState>("draft");
  const [events, setEvents] = useState<EventEntry[]>([]);

  const signals = useMemo(() => {
    const out: Record<string, SelectedSignal> = {};
    for (const ctx of enrichedContexts) {
      out[ctx.instrument.symbol] = decide(ctx, account, killSwitch);
    }
    return out;
  }, [enrichedContexts, account, killSwitch]);

  const selected = signals[selectedSymbol] ?? signals[contexts[0].instrument.symbol];

  const pushEvent = useCallback(
    (entry: Omit<EventEntry, "id" | "timestamp">) => {
      setEvents((prev) =>
        [
          {
            ...entry,
            id: `${entry.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 200),
      );
    },
    [],
  );

  const setSelectedSymbol = useCallback(
    (symbol: string) => {
      setSelectedSymbolRaw(symbol);
      setExecutionState("draft");
      pushEvent({ kind: "instrument_selected", symbol, detail: `Selected ${symbol}` });
    },
    [pushEvent],
  );

  const setKillSwitch = useCallback(
    (v: boolean) => {
      setKillSwitchRaw(v);
      setKillSwitchForBrief(v);
      pushEvent({
        kind: v ? "kill_switch_armed" : "kill_switch_disarmed",
        detail: v ? "Kill switch engaged — routing disabled." : "Kill switch disarmed.",
      });
    },
    [pushEvent],
  );

  const setQuorumEnabled = useCallback(
    (v: boolean) => {
      setQuorumEnabledRaw(v);
      pushEvent({
        kind: "quorum_toggled",
        detail: v ? "Quorum confirmation enabled." : "Quorum confirmation disabled.",
      });
    },
    [pushEvent],
  );

  // Auto-arm kill switch when Reggie's mental readiness says stand_aside.
  // Only fires when kill switch is currently off — prevents false disarm later.
  useEffect(() => {
    if (
      preMarketBrief.mentalReadiness.sessionReadiness === "stand_aside" &&
      !killSwitch
    ) {
      setKillSwitch(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preMarketBrief.mentalReadiness.sessionReadiness]);

  // Force execution state to reflect objective conditions.
  useEffect(() => {
    if (selected.hardBlock.active) {
      setExecutionState("blocked");
      pushEvent({
        kind: "hard_block_triggered",
        symbol: selected.candidate.instrument.symbol,
        detail: `Hard block: ${selected.hardBlock.reason ?? "unknown"}.`,
      });
    } else if (selected.sizing.finalContracts === 0) {
      setExecutionState("watch_only");
    } else {
      setExecutionState((prev) =>
        prev === "blocked" || prev === "watch_only" ? "draft" : prev,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.hardBlock.active, selected.sizing.finalContracts]);

  const propFirm = useMemo(
    () =>
      buildPropFirmControl(
        selected,
        account,
        executionState === "sent"
          ? "sent"
          : executionState === "approved" || executionState === "reduced_approved"
            ? "approved"
            : "draft",
      ),
    [selected, account, executionState],
  );

  const approve = useCallback(() => {
    if (executionState !== "draft") return;
    if (selected.hardBlock.active || selected.sizing.finalContracts === 0) return;
    const reduced = selected.adjustedScore < 0.58;
    setExecutionState(reduced ? "reduced_approved" : "approved");
    pushEvent({
      kind: "approved",
      symbol: selected.candidate.instrument.symbol,
      detail: `${reduced ? "Reduced-size" : "Full-size"} approval · ${selected.sizing.finalContracts} ctx.`,
    });
  }, [executionState, selected, pushEvent]);

  const send = useCallback(() => {
    if (executionState !== "approved" && executionState !== "reduced_approved") return;
    setExecutionState("sent");
    const c = selected.candidate;
    const inst = c.instrument;
    const newEntry: JournalEntry = {
      id: selected.id,
      timestamp: new Date().toISOString(),

      // quantitative
      symbol: inst.symbol,
      side: c.side,
      contracts: selected.sizing.finalContracts,
      entryPrice: c.entry,
      stopPrice: c.stop,
      tp1Price: c.tp1,
      tp2Price: c.tp2,
      stopDistance: c.stopDistance,
      rMultiple: c.rMultiple,
      perContractRisk: selected.sizing.perContractRisk,
      accountRiskDollars: selected.sizing.accountRiskDollars,
      notionalDollars: selected.sizing.finalContracts * inst.pointValue * c.entry,

      // strategy & rationale
      strategy: c.strategy,
      strategyLabel: STRATEGIES[c.strategy].label,
      regime: selected.context.regime,
      regimeConfidence: selected.context.regimeConfidence,
      rawScore: c.rawScore,
      adjustedScore: selected.adjustedScore,
      playbookReasons: c.reasons,
      state: executionState,

      // outcome placeholders — filled in after close
      status: "open",
    };
    setJournal((prev) => [newEntry, ...prev].slice(0, 500));
    pushEvent({
      kind: "sent",
      symbol: selected.candidate.instrument.symbol,
      detail: `Sent to TradersPost · ${selected.sizing.finalContracts} ctx.`,
    });
  }, [executionState, selected, pushEvent]);

  const updateJournalEntry = useCallback((id: string, patch: Partial<JournalEntry>) => {
    setJournal((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const deleteJournalEntry = useCallback((id: string) => {
    setJournal((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const resetWorkflow = useCallback(() => {
    if (selected.hardBlock.active) setExecutionState("blocked");
    else if (selected.sizing.finalContracts === 0) setExecutionState("watch_only");
    else setExecutionState("draft");
  }, [selected]);

  const markChartUnavailable = useCallback(
    (key: string, symbol: string) => {
      setChartUnavailable((prev) => ({ ...prev, [key]: symbol }));
      pushEvent({ kind: "chart_unavailable", detail: `Chart unavailable for ${symbol} (${key})` });
    },
    [pushEvent],
  );

  const clearChartUnavailable = useCallback(
    (key: string) => {
      setChartUnavailable((prev) => {
        if (!(key in prev)) return prev;
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      pushEvent({ kind: "chart_retried", detail: `Retrying chart for ${key}` });
    },
    [pushEvent],
  );

  const routeHealth = useMemo(() => buildMockRouteHealth(killSwitch), [killSwitch]);

  const value: WorkstationState = {
    contexts,
    signals,
    selectedSymbol,
    selected,
    account,
    killSwitch,
    quorumEnabled,
    setSelectedSymbol,
    setKillSwitch,
    setQuorumEnabled,
    setAccount,
    journal,
    logExecution: (entry) => setJournal((prev) => [entry, ...prev].slice(0, 500)),
    updateJournalEntry,
    deleteJournalEntry,
    page,
    setPage,
    chartViewMode,
    setChartViewMode,
    focusTimeframe,
    setFocusTimeframe,
    chartTimeframes,
    setChartTimeframes,
    chartFeedMode,
    setChartFeedMode,
    chartUnavailable,
    markChartUnavailable,
    clearChartUnavailable,
    executionState,
    approve,
    send,
    resetWorkflow,
    propFirm,
    routeHealth,
    events,
    pushEvent,
    preMarketBrief,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkstation(): WorkstationState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkstation must be used inside WorkstationProvider");
  return v;
}
