import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  AccountRiskConfig,
  InstrumentContext,
  SelectedSignal,
} from "../engine/types";
import { decide } from "../engine/decisionEngine";
import { DEFAULT_ACCOUNT } from "../engine/sizing";
import { mockContexts } from "../engine/mockData";

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
  const [selectedSymbol, setSelectedSymbol] = useState<string>(contexts[0]?.instrument.symbol ?? "MES");
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [killSwitch, setKillSwitch] = useState(false);
  const [quorumEnabled, setQuorumEnabled] = useState(false);
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  const signals = useMemo(() => {
    const out: Record<string, SelectedSignal> = {};
    for (const ctx of contexts) {
      out[ctx.instrument.symbol] = decide(ctx, account, killSwitch);
    }
    return out;
  }, [contexts, account, killSwitch]);

  const selected = signals[selectedSymbol] ?? signals[contexts[0].instrument.symbol];

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
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkstation(): WorkstationState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkstation must be used inside WorkstationProvider");
  return v;
}
