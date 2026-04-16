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
  ExecutionState,
  InstrumentContext,
  PropFirmControl,
  SelectedSignal,
  TimeframeId,
} from "../engine/types";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";
import { buildPropFirmControl } from "../engine/propFirm";
import { DEFAULT_QUAD_TIMEFRAMES, type ChartFeedMode } from "../engine/tradingView";

export type WorkspaceMode = "desk" | "control_center";
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

  // Control Center additions
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (m: WorkspaceMode) => void;
  chartViewMode: ChartViewMode;
  setChartViewMode: (m: ChartViewMode) => void;
  focusTimeframe: TimeframeId;
  setFocusTimeframe: (tf: TimeframeId) => void;
  chartTimeframes: TimeframeId[];
  setChartTimeframes: (tfs: TimeframeId[]) => void;
  chartFeedMode: ChartFeedMode;
  setChartFeedMode: (m: ChartFeedMode) => void;

  executionState: ExecutionState;
  approve: () => void;
  send: () => void;
  resetWorkflow: () => void;

  propFirm: PropFirmControl;
}

export interface JournalEntry {
  id: string;
  timestamp: string;
  symbol: string;
  strategy: string;
  regime: string;
  side: string;
  contracts: number;
  adjustedScore: number;
  state: string;
  outcomeR?: number;
  notes?: string;
}

const Ctx = createContext<WorkstationState | null>(null);

export function WorkstationProvider({ children }: PropsWithChildren) {
  const [contexts] = useState(mockContexts);
  const [selectedSymbol, setSelectedSymbolRaw] = useState<string>(
    contexts[0]?.instrument.symbol ?? "MES",
  );
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [killSwitch, setKillSwitch] = useState(false);
  const [quorumEnabled, setQuorumEnabled] = useState(false);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("desk");
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("quad");
  const [focusTimeframe, setFocusTimeframe] = useState<TimeframeId>("5");
  const [chartTimeframes, setChartTimeframes] = useState<TimeframeId[]>(DEFAULT_QUAD_TIMEFRAMES);
  const [chartFeedMode, setChartFeedMode] = useState<ChartFeedMode>("proxy");
  const [executionState, setExecutionState] = useState<ExecutionState>("draft");

  const signals = useMemo(() => {
    const out: Record<string, SelectedSignal> = {};
    for (const ctx of contexts) {
      out[ctx.instrument.symbol] = decide(ctx, account, killSwitch);
    }
    return out;
  }, [contexts, account, killSwitch]);

  const selected = signals[selectedSymbol] ?? signals[contexts[0].instrument.symbol];

  // Reset workflow whenever the selected trade changes — no stale approval.
  const setSelectedSymbol = useCallback((symbol: string) => {
    setSelectedSymbolRaw(symbol);
    setExecutionState("draft");
  }, []);

  // Force execution state to reflect objective conditions when they change.
  useEffect(() => {
    if (selected.hardBlock.active) {
      setExecutionState("blocked");
    } else if (selected.sizing.finalContracts === 0) {
      setExecutionState("watch_only");
    } else {
      setExecutionState((prev) =>
        prev === "blocked" || prev === "watch_only" ? "draft" : prev,
      );
    }
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
  }, [executionState, selected]);

  const send = useCallback(() => {
    if (executionState !== "approved" && executionState !== "reduced_approved") return;
    setExecutionState("sent");
    setJournal((prev) =>
      [
        {
          id: selected.id,
          timestamp: new Date().toISOString(),
          symbol: selected.candidate.instrument.symbol,
          strategy: selected.candidate.strategy,
          regime: selected.context.regime,
          side: selected.candidate.side,
          contracts: selected.sizing.finalContracts,
          adjustedScore: selected.adjustedScore,
          state: executionState,
        },
        ...prev,
      ].slice(0, 200),
    );
  }, [executionState, selected]);

  const resetWorkflow = useCallback(() => {
    if (selected.hardBlock.active) setExecutionState("blocked");
    else if (selected.sizing.finalContracts === 0) setExecutionState("watch_only");
    else setExecutionState("draft");
  }, [selected]);

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
    logExecution: (entry) => setJournal((prev) => [entry, ...prev].slice(0, 200)),
    workspaceMode,
    setWorkspaceMode,
    chartViewMode,
    setChartViewMode,
    focusTimeframe,
    setFocusTimeframe,
    chartTimeframes,
    setChartTimeframes,
    chartFeedMode,
    setChartFeedMode,
    executionState,
    approve,
    send,
    resetWorkflow,
    propFirm,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkstation(): WorkstationState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkstation must be used inside WorkstationProvider");
  return v;
}
