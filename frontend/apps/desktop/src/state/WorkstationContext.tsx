import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  StrategyId,
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
import {
  evaluateAutoPilot,
  AUTOPILOT_MIN_SCORE_DEFAULT,
  type AutoPilotDecision,
} from "../engine/autoPilot";
import {
  buildMarketDataProvider,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_PROVIDER_CONFIG,
  type CrossMarketSnapshot,
  type MarketDataProviderConfig,
  type MarketDataProviderKind,
} from "../engine/marketDataProvider";
import {
  dispatchToTradersPost,
  dispatchTelegram,
  DEFAULT_DISPATCH_CONFIG,
  DEFAULT_TELEGRAM_CONFIG,
  type DispatchConfig,
  type DispatchResult,
  type TelegramConfig,
  type TelegramDispatchResult,
} from "../engine/dispatch";
import { formatExecution } from "../engine/executionFormatter";
import {
  formatApprovalMessage,
  formatBriefMessage,
  formatSentMessage,
  formatSignalMessage,
} from "../engine/telegramMessages";

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

  // Capital Lab — which playbook strategy is under validation.
  // `null` means "use the active signal's strategy".
  capitalLabStrategy: StrategyId | null;
  setCapitalLabStrategy: (s: StrategyId | null) => void;

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

  // Auto Pilot — system takes the approve + send steps automatically
  // when every guardrail passes. See engine/autoPilot.ts.
  autoPilot: boolean;
  setAutoPilot: (v: boolean) => void;
  autoTradeCount: number;
  autoPilotMinScore: number;
  setAutoPilotMinScore: (v: number) => void;
  lastAutoPilotDecision: AutoPilotDecision | null;

  // Market data feed
  providerConfig: MarketDataProviderConfig;
  setProviderConfig: (cfg: MarketDataProviderConfig) => void;
  feedStatus: FeedStatus;
  feedLastUpdate: string | null;
  feedLatencyMs: number | null;
  feedError: string | null;
  refreshFeed: () => void;

  // Cross-market context (VIX/DXY/10y) — null until backend snapshot carries one.
  crossMarket: CrossMarketSnapshot | null;

  // TradersPost dispatch
  dispatchConfig: DispatchConfig;
  setDispatchConfig: (cfg: DispatchConfig) => void;
  lastDispatchResult: DispatchResult | null;
  testDispatch: () => Promise<DispatchResult>;

  // Telegram notifications
  telegramConfig: TelegramConfig;
  setTelegramConfig: (cfg: TelegramConfig) => void;
  lastTelegramResult: TelegramDispatchResult | null;
  testTelegram: () => Promise<TelegramDispatchResult>;
}

export type FeedStatus = "idle" | "loading" | "live" | "error";

const JOURNAL_STORAGE_KEY = "nextrade.journal.v1";
const PROVIDER_CONFIG_STORAGE_KEY = "nextrade.marketDataProvider.v1";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function loadProviderConfig(): MarketDataProviderConfig {
  if (typeof window === "undefined") return DEFAULT_PROVIDER_CONFIG;
  try {
    const raw = window.localStorage.getItem(PROVIDER_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDER_CONFIG;
    const parsed = JSON.parse(raw) as MarketDataProviderConfig;
    return { ...DEFAULT_PROVIDER_CONFIG, ...parsed };
  } catch { return DEFAULT_PROVIDER_CONFIG; }
}

function persistProviderConfig(cfg: MarketDataProviderConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROVIDER_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch { /* ignore */ }
}

const DISPATCH_CONFIG_STORAGE_KEY = "nextrade.dispatch.v1";
const TELEGRAM_CONFIG_STORAGE_KEY = "nextrade.telegram.v1";

function loadDispatchConfig(): DispatchConfig {
  if (typeof window === "undefined") return DEFAULT_DISPATCH_CONFIG;
  try {
    const raw = window.localStorage.getItem(DISPATCH_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_DISPATCH_CONFIG;
    const parsed = JSON.parse(raw) as DispatchConfig;
    return { ...DEFAULT_DISPATCH_CONFIG, ...parsed };
  } catch { return DEFAULT_DISPATCH_CONFIG; }
}

function persistDispatchConfig(cfg: DispatchConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISPATCH_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch { /* ignore */ }
}

function loadTelegramConfig(): TelegramConfig {
  if (typeof window === "undefined") return DEFAULT_TELEGRAM_CONFIG;
  try {
    const raw = window.localStorage.getItem(TELEGRAM_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_TELEGRAM_CONFIG;
    const parsed = JSON.parse(raw) as TelegramConfig;
    return {
      ...DEFAULT_TELEGRAM_CONFIG,
      ...parsed,
      triggers: { ...DEFAULT_TELEGRAM_CONFIG.triggers, ...(parsed?.triggers ?? {}) },
    };
  } catch { return DEFAULT_TELEGRAM_CONFIG; }
}

function persistTelegramConfig(cfg: TelegramConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TELEGRAM_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch { /* ignore */ }
}

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
  const [providerConfig, setProviderConfigRaw] = useState<MarketDataProviderConfig>(
    () => loadProviderConfig(),
  );
  const [contexts, setContexts] = useState<InstrumentContext[]>(mockContexts);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("idle");
  const [feedLastUpdate, setFeedLastUpdate] = useState<string | null>(null);
  const [feedLatencyMs, setFeedLatencyMs] = useState<number | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [crossMarket, setCrossMarket] = useState<CrossMarketSnapshot | null>(null);
  const feedRefreshRef = useRef<(() => void) | null>(null);

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
  const [capitalLabStrategy, setCapitalLabStrategy] = useState<StrategyId | null>(null);
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("quad");
  const [focusTimeframe, setFocusTimeframe] = useState<TimeframeId>("5");
  const [chartTimeframes, setChartTimeframes] = useState<TimeframeId[]>(DEFAULT_QUAD_TIMEFRAMES);
  const [chartFeedMode, setChartFeedMode] = useState<ChartFeedMode>("proxy");
  const [chartUnavailable, setChartUnavailable] = useState<Record<string, string>>({});

  const [executionState, setExecutionState] = useState<ExecutionState>("draft");
  const [events, setEvents] = useState<EventEntry[]>([]);

  const [autoPilot, setAutoPilotRaw] = useState(false);
  const [autoTradeCount, setAutoTradeCount] = useState(0);
  const [autoPilotMinScore, setAutoPilotMinScore] = useState(AUTOPILOT_MIN_SCORE_DEFAULT);
  const [lastAutoPilotDecision, setLastAutoPilotDecision] = useState<AutoPilotDecision | null>(null);
  const lastProcessedSignalIdRef = useRef<string | null>(null);

  const [dispatchConfig, setDispatchConfigRaw] = useState<DispatchConfig>(loadDispatchConfig);
  const [lastDispatchResult, setLastDispatchResult] = useState<DispatchResult | null>(null);

  const [telegramConfig, setTelegramConfigRaw] = useState<TelegramConfig>(loadTelegramConfig);
  const [lastTelegramResult, setLastTelegramResult] = useState<TelegramDispatchResult | null>(null);

  useEffect(() => { persistDispatchConfig(dispatchConfig); }, [dispatchConfig]);
  useEffect(() => { persistTelegramConfig(telegramConfig); }, [telegramConfig]);

  const setDispatchConfig = useCallback((cfg: DispatchConfig) => {
    setDispatchConfigRaw(cfg);
  }, []);

  const setTelegramConfig = useCallback((cfg: TelegramConfig) => {
    setTelegramConfigRaw(cfg);
  }, []);

  // --- Telegram notification triggers --------------------------------
  // Refs deduplicate state-change fires (prevents re-render storms
  // from re-sending the same message).
  const tgLastBriefDateRef = useRef<string | null>(null);
  const tgLastSignalIdRef = useRef<string | null>(null);
  const tgLastApprovalStateRef = useRef<string | null>(null);
  const tgLastSentIdRef = useRef<string | null>(null);

  const signals = useMemo(() => {
    const out: Record<string, SelectedSignal> = {};
    for (const ctx of enrichedContexts) {
      out[ctx.instrument.symbol] = decide(ctx, account, killSwitch, journal, crossMarket);
    }
    return out;
  }, [enrichedContexts, account, killSwitch, journal, crossMarket]);

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

  const setAutoPilot = useCallback(
    (v: boolean) => {
      setAutoPilotRaw(v);
      if (!v) {
        setAutoTradeCount(0);
        lastProcessedSignalIdRef.current = null;
        setLastAutoPilotDecision(null);
      }
      pushEvent({
        kind: v ? "auto_pilot_armed" : "auto_pilot_disarmed",
        detail: v
          ? `Auto Pilot armed · score floor ${autoPilotMinScore.toFixed(2)} · respects readiness & kill switch.`
          : "Auto Pilot disarmed — manual approval required.",
      });
    },
    [pushEvent, autoPilotMinScore],
  );

  // ---- Market data feed polling ----
  // Builds the provider from config, polls on an interval, updates
  // contexts + feed status. Errors surface in the UI and stop the loop
  // until config changes (no auto-retry storms).
  useEffect(() => {
    persistProviderConfig(providerConfig);
    const provider = buildMarketDataProvider(providerConfig);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      setFeedStatus((prev) => (prev === "live" ? "live" : "loading"));
      try {
        const snap = await provider.snapshot();
        if (cancelled) return;
        setContexts(snap.contexts);
        setFeedLastUpdate(snap.receivedAt);
        setFeedLatencyMs(snap.latencyMs);
        setFeedError(null);
        setFeedStatus("live");
        if (snap.crossMarket !== undefined) setCrossMarket(snap.crossMarket);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setFeedError(msg);
        setFeedStatus("error");
        return; // stop scheduling on error
      }
      const interval = providerConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      // mock provider is static, no point polling more than once
      if (providerConfig.kind === "mock") return;
      timer = setTimeout(poll, interval);
    };

    feedRefreshRef.current = () => { poll(); };
    poll();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [providerConfig]);

  const setProviderConfig = useCallback((cfg: MarketDataProviderConfig) => {
    setProviderConfigRaw(cfg);
  }, []);

  const refreshFeed = useCallback(() => {
    feedRefreshRef.current?.();
  }, []);

  // Auto-arm kill switch when Reggie's mental readiness says stand_aside.
  // Also force-disarms Auto Pilot — we don't want the system routing on a
  // day Reggie flagged as "do not trade". One-way only (never auto-disarms).
  useEffect(() => {
    if (
      preMarketBrief.mentalReadiness.sessionReadiness === "stand_aside" &&
      !killSwitch
    ) {
      setKillSwitch(true);
      if (autoPilot) setAutoPilot(false);
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

  // Telegram trigger 1/4 — pre-market brief (one message per session date)
  useEffect(() => {
    if (!telegramConfig.enabled || !telegramConfig.triggers.brief) return;
    if (tgLastBriefDateRef.current === preMarketBrief.date) return;
    tgLastBriefDateRef.current = preMarketBrief.date;
    dispatchTelegram(formatBriefMessage(preMarketBrief), telegramConfig)
      .then(setLastTelegramResult);
  }, [preMarketBrief, telegramConfig]);

  // Telegram trigger 2/4 — new signal selected (only tradeable ones,
  // skip stand-aside + hard blocks to avoid noise). Dedup by a stable
  // setup key (symbol+strategy+regime+side) — NOT selected.id, which
  // embeds a poll timestamp and would fire every 5 seconds.
  useEffect(() => {
    if (!telegramConfig.enabled || !telegramConfig.triggers.signal) return;
    if (selected.hardBlock.active) return;
    if (selected.state === "stand_aside" || selected.state === "hard_blocked") return;
    const c = selected.candidate;
    const setupKey = `${c.instrument.symbol}-${c.strategy}-${c.regime}-${c.side}`;
    if (tgLastSignalIdRef.current === setupKey) return;
    tgLastSignalIdRef.current = setupKey;
    dispatchTelegram(formatSignalMessage(selected), telegramConfig)
      .then(setLastTelegramResult);
  }, [selected, telegramConfig]);

  // Telegram trigger 3/4 — approval state transitions (keyed on stable
  // setup + executionState, not selected.id which rotates each poll).
  useEffect(() => {
    if (!telegramConfig.enabled || !telegramConfig.triggers.approval) return;
    const c = selected.candidate;
    const setupKey = `${c.instrument.symbol}-${c.strategy}-${c.regime}-${c.side}`;
    const key = `${setupKey}:${executionState}`;
    if (tgLastApprovalStateRef.current === key) return;
    if (executionState === "draft" && propFirm.finalContracts > 0 && !selected.hardBlock.active) {
      tgLastApprovalStateRef.current = key;
      dispatchTelegram(formatApprovalMessage(selected, propFirm, "needed"), telegramConfig)
        .then(setLastTelegramResult);
    } else if (executionState === "approved" || executionState === "reduced_approved") {
      tgLastApprovalStateRef.current = key;
      dispatchTelegram(formatApprovalMessage(selected, propFirm, "given"), telegramConfig)
        .then(setLastTelegramResult);
    }
  }, [selected, executionState, propFirm, telegramConfig]);

  // Auto Pilot: evaluate guardrails on every selected-signal / state
  // change. When all pass, approve + send in one step and bump the
  // daily counter. Skipped evaluations log an event so the trader sees
  // WHY auto pilot didn't act.
  useEffect(() => {
    if (!autoPilot) return;
    const decision = evaluateAutoPilot({
      autoPilot,
      killSwitch,
      signal: selected,
      propFirm,
      executionState,
      brief: preMarketBrief,
      autoTradeCount,
      lastProcessedSignalId: lastProcessedSignalIdRef.current,
      minAdjustedScore: autoPilotMinScore,
    });
    setLastAutoPilotDecision(decision);

    if (decision.action === "skip") {
      // Don't spam the audit trail for the boring reasons (already
      // processed / autopilot_off / not_draft). Only log skips that
      // represent a guardrail-triggered hold.
      const noisySkips: typeof decision.reasonCode[] = ["already_processed", "autopilot_off", "not_draft"];
      if (!noisySkips.includes(decision.reasonCode)) {
        pushEvent({
          kind: "auto_pilot_skipped",
          symbol: selected.candidate.instrument.symbol,
          detail: decision.reason,
        });
      }
      return;
    }

    // approve_and_send path — stamp signal id before firing so the
    // effect doesn't re-run this path when state transitions
    // (executionState: draft -> approved -> sent).
    lastProcessedSignalIdRef.current = selected.id;

    const reduced = selected.adjustedScore < 0.58;
    setExecutionState("sent");
    setAutoTradeCount((n) => n + 1);

    // Fire dispatch in the background; the journal entry below records
    // the auto-pilot decision regardless of dispatch outcome (which is
    // recorded as an event when it resolves).
    const tpPayload = formatExecution(selected).tradersPost;
    dispatchToTradersPost(tpPayload, dispatchConfig).then((dispatchResult) => {
      setLastDispatchResult(dispatchResult);
      pushEvent({
        kind: "sent",
        symbol: selected.candidate.instrument.symbol,
        detail: dispatchConfig.enabled
          ? (dispatchResult.ok
              ? `Auto Pilot → TradersPost OK · HTTP ${dispatchResult.status}`
              : `Auto Pilot → TradersPost FAILED · ${dispatchResult.message}`)
          : `Auto Pilot send (dispatch disabled).`,
      });
      const autoSentKey = `${selected.candidate.instrument.symbol}-${selected.candidate.strategy}-${selected.candidate.regime}-${selected.candidate.side}-auto`;
      if (telegramConfig.enabled && telegramConfig.triggers.sent && tgLastSentIdRef.current !== autoSentKey) {
        tgLastSentIdRef.current = autoSentKey;
        const status: "ok" | "fail" | "mock" = dispatchConfig.enabled
          ? (dispatchResult.ok ? "ok" : "fail")
          : "mock";
        dispatchTelegram(
          formatSentMessage(selected, status, dispatchResult.status ? String(dispatchResult.status) : dispatchResult.message, true),
          telegramConfig,
        ).then(setLastTelegramResult);
      }
    });

    const c = selected.candidate;
    const inst = c.instrument;
    const newEntry: JournalEntry = {
      id: selected.id,
      timestamp: new Date().toISOString(),
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
      strategy: c.strategy,
      strategyLabel: STRATEGIES[c.strategy].label,
      regime: selected.context.regime,
      regimeConfidence: selected.context.regimeConfidence,
      rawScore: c.rawScore,
      adjustedScore: selected.adjustedScore,
      playbookReasons: c.reasons,
      state: reduced ? "reduced_approved" : "approved",
      status: "open",
      notes: `Auto-piloted · ${decision.reason}`,
    };
    setJournal((prev) => [newEntry, ...prev].slice(0, 500));

    pushEvent({
      kind: "auto_pilot_executed",
      symbol: inst.symbol,
      detail: `Auto Pilot routed ${c.side.toUpperCase()} ${inst.symbol} · ${selected.sizing.finalContracts} ct · adj ${selected.adjustedScore.toFixed(2)} (${autoTradeCount + 1}/${preMarketBrief.mentalReadiness.suggestedMaxTrades}).`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoPilot,
    killSwitch,
    selected.id,
    selected.hardBlock.active,
    selected.sizing.finalContracts,
    selected.adjustedScore,
    propFirm.compliance.passing,
    executionState,
    preMarketBrief.mentalReadiness.sessionReadiness,
    preMarketBrief.mentalReadiness.suggestedMaxTrades,
    autoPilotMinScore,
    dispatchConfig,
    telegramConfig,
  ]);

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

  const send = useCallback(async () => {
    if (executionState !== "approved" && executionState !== "reduced_approved") return;
    setExecutionState("sent");

    // Dispatch to TradersPost (no-op when disabled). Awaited so the
    // journal entry can carry the result, but state already moved to
    // "sent" so the UI is responsive.
    const tpPayload = formatExecution(selected).tradersPost;
    const dispatchResult = await dispatchToTradersPost(tpPayload, dispatchConfig);
    setLastDispatchResult(dispatchResult);

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
      notes: dispatchConfig.enabled
        ? (dispatchResult.ok
            ? `TradersPost dispatched · HTTP ${dispatchResult.status}`
            : `TradersPost dispatch FAILED · ${dispatchResult.message}`)
        : undefined,
    };
    setJournal((prev) => [newEntry, ...prev].slice(0, 500));
    pushEvent({
      kind: "sent",
      symbol: selected.candidate.instrument.symbol,
      detail: dispatchConfig.enabled
        ? (dispatchResult.ok
            ? `Sent to TradersPost · ${selected.sizing.finalContracts} ctx · HTTP ${dispatchResult.status}`
            : `TradersPost dispatch FAILED · ${dispatchResult.message}`)
        : `Sent (mock — dispatch disabled) · ${selected.sizing.finalContracts} ctx.`,
    });

    const manualSentKey = `${selected.candidate.instrument.symbol}-${selected.candidate.strategy}-${selected.candidate.regime}-${selected.candidate.side}-manual`;
    if (telegramConfig.enabled && telegramConfig.triggers.sent && tgLastSentIdRef.current !== manualSentKey) {
      tgLastSentIdRef.current = manualSentKey;
      const status: "ok" | "fail" | "mock" = dispatchConfig.enabled
        ? (dispatchResult.ok ? "ok" : "fail")
        : "mock";
      dispatchTelegram(
        formatSentMessage(selected, status, dispatchResult.status ? String(dispatchResult.status) : dispatchResult.message, false),
        telegramConfig,
      ).then(setLastTelegramResult);
    }
  }, [executionState, selected, pushEvent, dispatchConfig, telegramConfig]);

  // Send a synthetic test payload through the dispatch pipeline so the
  // user can verify their TradersPost webhook before arming Auto Pilot.
  //
  // The test ALWAYS hits the backend (even when live dispatch is
  // disabled in Settings) so the operator can prove the pipe works
  // end-to-end. The payload is forced to a valid shape (quantity ≥ 1,
  // well-formed levels) so we never fail validation because the current
  // live signal happens to be watch-only or hard-blocked.
  const testDispatch = useCallback(async (): Promise<DispatchResult> => {
    const base = formatExecution(selected).tradersPost;
    const c = selected.candidate;
    const entry = c.entry > 0 ? c.entry : 100;
    const stopDistance = Math.abs(c.entry - c.stop) > 0 ? Math.abs(c.entry - c.stop) : 1;
    const side: "buy" | "sell" = c.side === "short" ? "sell" : "buy";
    const sign = side === "buy" ? 1 : -1;
    const syntheticPayload = {
      ...base,
      action: side,
      orderType: "limit" as const,
      price: round2(entry),
      quantity: 1,
      stopLoss: { type: "stop" as const, stopPrice: round2(entry - sign * stopDistance) },
      takeProfit: { limitPrice: round2(entry + sign * stopDistance * 2) },
      sentiment: side === "buy" ? ("bullish" as const) : ("bearish" as const),
    };
    // Always hit the backend — the `enabled` flag only gates real
    // production sends, not test probes.
    const result = await dispatchToTradersPost(syntheticPayload, { ...dispatchConfig, enabled: true });
    setLastDispatchResult(result);
    return result;
  }, [selected, dispatchConfig]);

  // Send a test Telegram message so the user can verify their bot token
  // + chat id before relying on real trigger notifications.
  const testTelegram = useCallback(async (): Promise<TelegramDispatchResult> => {
    const text = `🧪 Nextrade AI · test message · ${new Date().toLocaleString()}`;
    const result = await dispatchTelegram(text, telegramConfig);
    setLastTelegramResult(result);
    return result;
  }, [telegramConfig]);

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
    capitalLabStrategy,
    setCapitalLabStrategy,
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
    autoPilot,
    setAutoPilot,
    autoTradeCount,
    autoPilotMinScore,
    setAutoPilotMinScore,
    lastAutoPilotDecision,
    providerConfig,
    setProviderConfig,
    feedStatus,
    feedLastUpdate,
    feedLatencyMs,
    feedError,
    refreshFeed,
    crossMarket,
    dispatchConfig,
    setDispatchConfig,
    lastDispatchResult,
    testDispatch,
    telegramConfig,
    setTelegramConfig,
    lastTelegramResult,
    testTelegram,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkstation(): WorkstationState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkstation must be used inside WorkstationProvider");
  return v;
}
