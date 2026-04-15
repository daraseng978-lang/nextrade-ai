import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const COLORS = {
  bg: '#0F1113',
  bgElevated: '#14181D',
  card: '#181C21',
  cardElevated: '#1C2128',
  cardHero: '#1A2027',
  border: '#2F3742',
  borderStrong: '#3B4654',
  text: '#FFFFFF',
  textStrong: '#E8EDF5',
  textSoft: '#B8C0CC',
  textMuted: '#8A93A3',
  accent: '#4DA3FF',
  green: '#2FCB73',
  red: '#E45D5D',
  amber: '#E6A23C',
  blue: '#5B8CFF',
  gray: '#8A93A3',
};

const API_BASE = 'http://localhost:8000';

function secondaryButtonStyle(isDanger = false) {
  return {
    background: COLORS.cardElevated,
    borderColor: isDanger ? COLORS.red : COLORS.borderStrong,
    color: isDanger ? COLORS.red : COLORS.textStrong,
  };
}

function HeroCard({ children, className = '' }) {
  return (
    <Card
      className={className}
      style={{
        background: COLORS.cardHero,
        borderColor: COLORS.borderStrong,
        boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
      }}
    >
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function Surface({ children, className = '' }) {
  return (
    <Card className={className} style={{ background: COLORS.card, borderColor: COLORS.border }}>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function RowPanel({ children, className = '' }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${className}`} style={{ background: COLORS.bgElevated, borderColor: COLORS.border }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle, action = null }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <div className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: COLORS.textStrong }}>{title}</div>
        {subtitle ? <div className="mt-1 text-[12px]" style={{ color: COLORS.textMuted }}>{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

function Pill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="min-h-[44px] rounded-full border px-3 py-2 text-[12px] font-medium"
      style={{
        borderColor: active ? COLORS.borderStrong : COLORS.border,
        color: active ? COLORS.text : COLORS.textSoft,
        background: active ? 'rgba(77,163,255,0.10)' : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  const color = normalized.includes('execut') || normalized.includes('routed')
    ? COLORS.green
    : normalized.includes('approv')
      ? COLORS.blue
      : normalized.includes('pending') || normalized.includes('warning')
        ? COLORS.amber
        : normalized.includes('block') || normalized.includes('reject') || normalized.includes('fail')
          ? COLORS.red
          : COLORS.gray;

  return (
    <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: COLORS.border, color }}>
      {status}
    </span>
  );
}

function DirectionPill({ direction }) {
  const dir = String(direction || '').toUpperCase();
  const color = dir === 'LONG' ? COLORS.green : dir === 'SHORT' ? COLORS.red : COLORS.amber;
  return (
    <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: COLORS.border, color }}>
      {dir}
    </span>
  );
}

function MetricStack({ label, value, tone = 'default', mono = false }) {
  const color = tone === 'good' ? COLORS.green : tone === 'bad' ? COLORS.red : tone === 'warn' ? COLORS.amber : COLORS.textStrong;
  return (
    <div>
      <div className="text-[12px]" style={{ color: COLORS.textMuted }}>{label}</div>
      <div className="mt-1 text-[17px] font-semibold tracking-[-0.02em]" style={{ color, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}>{value}</div>
    </div>
  );
}

function MiniMetric({ label, value, tone = 'default' }) {
  const color = tone === 'good' ? COLORS.green : tone === 'bad' ? COLORS.red : tone === 'warn' ? COLORS.amber : COLORS.text;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: COLORS.border, background: COLORS.bgElevated }}>
      <div className="text-[11px]" style={{ color: COLORS.textMuted }}>{label}</div>
      <div className="mt-1 text-[16px] font-semibold tracking-[-0.02em]" style={{ color }}>{value}</div>
    </div>
  );
}

function formatET(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function buildTelegramText(signal) {
  return [
    `${signal.symbol} ${signal.direction}`,
    `Entry: ${(signal.entry_zone || []).join(' - ') || 'N/A'}`,
    `SL: ${signal.stop ?? '—'}`,
    `TP1: ${signal.tp1 ?? '—'}`,
    signal.tp2 != null ? `TP2: ${signal.tp2}` : null,
  ].filter(Boolean).join('\n');
}

function buildKeyValueText(signal) {
  return [
    `SIGNAL_ID=${signal.id ?? ''}`,
    `SYMBOL=${signal.symbol ?? ''}`,
    `SIDE=${signal.direction ?? ''}`,
    `ENTRY=${signal.entry_zone?.[0] ?? ''}`,
    `STOP=${signal.stop ?? ''}`,
    `TP1=${signal.tp1 ?? ''}`,
  ].join('\n');
}

function buildJsonText(signal) {
  return JSON.stringify({
    signal_id: signal.id,
    symbol: signal.symbol,
    direction: signal.direction,
    entry_zone: signal.entry_zone,
    stop: signal.stop,
    tp1: signal.tp1,
    tp2: signal.tp2,
    confidence: signal.confidence,
    strategy: signal.strategy,
  }, null, 2);
}

const PLAYBOOK_LIBRARY = {
  'Balanced Auction Rotation': {
    regime: 'Balanced Range',
    conditions: 'Price rotating between clear support and resistance. Overnight range < 0.5x ATR. VWAP flat. Prior day balanced. No high-impact data pending.',
    invalidation: 'Price breaks and holds above/below range on volume. VWAP trends. Expansion candle with 2x+ range.',
  },
  'No-Trade / High-Risk': {
    regime: 'Low Quality No Trade / Event Driven High Risk',
    conditions: 'No clear directional bias. Conflicting cross-market signals. Major event risk within 2 hours. VIX > 30 or spiking. ATR > 2x normal. Thin liquidity or repeated failed setups.',
    invalidation: 'N/A — conditions improve after event risk passes, VIX normalizes, and directional clarity returns.',
  },
  'Expansion / Breakout': {
    regime: 'Strong Trend Up / Strong Trend Down',
    conditions: 'Overnight range >= 0.7x ATR. Price above/below prior reference levels. Multiple indices aligned. Gap-and-go structure with clear institutional flow.',
    invalidation: 'Reversal candle at 2x ATR extension. Volume divergence on new highs/lows.',
  },
  'Counter-Trend Fade': {
    regime: 'Reversal Mean Reversion / Balanced Range',
    conditions: 'Price breaks a key level but fails to hold. Breakout volume declines. Indices do not confirm. ATR already consumed and late-session failure risk rises.',
    invalidation: 'Breakout reasserts with stronger volume and broader confirmation.',
  },
  'Liquidity Sweep & Reclaim': {
    regime: 'Reversal Mean Reversion / Balanced Range',
    conditions: 'Price sweeps a key level, reverses back inside, shows stop-run behavior, and is absorbed while higher-timeframe structure stays intact.',
    invalidation: 'Price sustains beyond swept level for more than 5 minutes with new volume acceptance.',
  },
  'VWAP Reclaim': {
    regime: 'Balanced Range / Reversal Mean Reversion',
    conditions: 'Price reclaims VWAP after meaningful extension and fading opposing momentum.',
    invalidation: 'VWAP reclaim fails and fresh initiative flow takes over.',
  },
  'Opening Range Breakout': {
    regime: 'Expansion Breakout',
    conditions: 'Gap up/down with follow-through. Prior day range < ATR. Volume expands on breakout. Overnight directional bias is clear and indices align.',
    invalidation: 'Price reverses back through the opening range within 15 minutes and breakout volume dries up.',
  },
  'Trend Pullback Continuation': {
    regime: 'Strong Trend Up / Strong Trend Down',
    conditions: 'Established trend with 3+ higher highs/lower lows. Pullback to VWAP or key moving average. Volume contracts on pullback and cross-market remains aligned.',
    invalidation: 'Pullback breaks prior swing and VWAP is lost on strong volume.',
  },
  ORB: {
    regime: 'Expansion Breakout',
    conditions: 'Opening range holds and breaks with expanding volume and aligned index context.',
    invalidation: 'Price fails back into opening range quickly after breakout.',
  },
};

function getPlaybookForSignal(signal) {
  const explicit = PLAYBOOK_LIBRARY[signal.strategy];
  if (explicit) return { name: signal.strategy, ...explicit };

  const strategy = String(signal.strategy || '').toLowerCase();
  if (strategy.includes('orb')) return { name: 'Opening Range Breakout', ...PLAYBOOK_LIBRARY['Opening Range Breakout'] };
  if (strategy.includes('vwap')) return { name: 'VWAP Reclaim', ...PLAYBOOK_LIBRARY['VWAP Reclaim'] };
  if (strategy.includes('sweep')) return { name: 'Liquidity Sweep & Reclaim', ...PLAYBOOK_LIBRARY['Liquidity Sweep & Reclaim'] };
  if (strategy.includes('pullback')) return { name: 'Trend Pullback Continuation', ...PLAYBOOK_LIBRARY['Trend Pullback Continuation'] };
  if (strategy.includes('fade')) return { name: 'Counter-Trend Fade', ...PLAYBOOK_LIBRARY['Counter-Trend Fade'] };
  if (strategy.includes('breakout') || strategy.includes('expansion')) return { name: 'Expansion / Breakout', ...PLAYBOOK_LIBRARY['Expansion / Breakout'] };
  return { name: 'No-Trade / High-Risk', ...PLAYBOOK_LIBRARY['No-Trade / High-Risk'] };
}

function getPlaybookReason(signal) {
  const reasons = [];
  const confidencePct = Math.round((signal.confidence || 0) * 100);
  if (confidencePct >= 70) reasons.push(`Confidence is elevated at ${confidencePct}%`);
  if (signal.regime) reasons.push(`Regime maps to ${String(signal.regime).replace(/_/g, ' ')}`);
  if (signal.source) reasons.push(`Source context came from ${signal.source}`);
  if (signal.max_risk_usd) reasons.push(`Risk budget is contained at $${signal.max_risk_usd}`);
  if (Array.isArray(signal.checks) && signal.checks.length > 0) {
    const passCount = signal.checks.filter((c) => c.pass || c.passed).length;
    reasons.push(`${passCount}/${signal.checks.length} validation checks passed`);
  }
  return reasons;
}

const DEV_TESTS = [
  {
    name: 'Telegram formatter includes first line',
    pass: buildTelegramText({ symbol: 'MNQ', direction: 'LONG', entry_zone: [1, 2], stop: 0, tp1: 3 }).startsWith('MNQ LONG'),
  },
  {
    name: 'Key=Value formatter includes signal id',
    pass: buildKeyValueText({ id: 'SIG-1', symbol: 'MNQ', direction: 'LONG', entry_zone: [1, 2], stop: 0, tp1: 3 }).includes('SIGNAL_ID=SIG-1'),
  },
  {
    name: 'JSON formatter returns parseable JSON',
    pass: (() => {
      try {
        JSON.parse(buildJsonText({ id: 'SIG-1', symbol: 'MNQ', direction: 'LONG', entry_zone: [1, 2], stop: 0, tp1: 3 }));
        return true;
      } catch {
        return false;
      }
    })(),
  },
  {
    name: 'Playbook mapping resolves ORB',
    pass: getPlaybookForSignal({ strategy: 'ORB' }).name === 'ORB',
  },
];

const FALLBACK_DASHBOARD = { automation_mode: 'OFF', kill_switch: false, pending_approvals: 1, routed_today: 0, executed_today: 0, failed_today: 0, last_outbound_signal: null, last_inbound_tradingview: null };
const FALLBACK_SIGNALS = [];
const FALLBACK_BROKERS = [];
const FALLBACK_AUDIT = [];
const FALLBACK_SETTINGS = { automation_mode: 'OFF', kill_switch: false, duplicate_window_minutes: 30, expiry_minutes: 20, event_lockout_enabled: true, instrument_whitelist: ['MNQ', 'MES', 'MYM', 'MGC'], max_open_positions: 3, max_daily_trades: 10, max_risk_per_trade: 250, max_total_daily_risk: 1000, tradingview_secret: 'tv-demo-secret' };
const FALLBACK_DECISIONS = { MES: { instrument: 'MES', decision: 'TRADE', top_regime: 'strong_trend_up', regime_confidence: 0.54, recommended_strategy: 'trend_pullback_continuation', no_trade_score: 0.22, risk_gate: { blocked: false, warnings: [] }, best_trade: { candidate_id: 'CAND-DEMO-MES', strategy: 'trend_pullback_continuation', direction: 'LONG', entry_zone: [5293.68, 5295.3], stop: 5287.2, tp1: 5305.02, tp2: 5310.42, suggested_size: 3, risk_budget: 150, max_risk_usd: 150, risk_per_contract: 32.4, quality_score: 0.73, final_rank_score: 15.8 }, candidates: [] }, MNQ: { instrument: 'MNQ', decision: 'TRADE', top_regime: 'strong_trend_up', regime_confidence: 0.59, recommended_strategy: 'opening_range_breakout', no_trade_score: 0.18, risk_gate: { blocked: false, warnings: [] }, best_trade: { candidate_id: 'CAND-DEMO-MNQ', strategy: 'opening_range_breakout', direction: 'LONG', entry_zone: [18425.2, 18431.5], stop: 18400.0, tp1: 18469.3, tp2: 18490.3, suggested_size: 2, risk_budget: 150, max_risk_usd: 150, risk_per_contract: 56.7, quality_score: 0.77, final_rank_score: 18.4 }, candidates: [] }, MYM: { instrument: 'MYM', decision: 'NO_TRADE', top_regime: 'balanced_range', regime_confidence: 0.42, recommended_strategy: 'defensive_sit_out', no_trade_score: 0.61, risk_gate: { blocked: false, warnings: ['Cross-market signals conflict'] }, best_trade: { candidate_id: 'CAND-DEMO-MYM', strategy: 'defensive_sit_out', direction: 'WATCH', entry_zone: [], stop: null, tp1: null, tp2: null, suggested_size: 0, risk_budget: 0, max_risk_usd: 0, risk_per_contract: 0, quality_score: 0.44, final_rank_score: 0 }, candidates: [] }, MGC: { instrument: 'MGC', decision: 'TRADE', top_regime: 'expansion_breakout', regime_confidence: 0.46, recommended_strategy: 'liquidity_sweep_reclaim', no_trade_score: 0.27, risk_gate: { blocked: false, warnings: [] }, best_trade: { candidate_id: 'CAND-DEMO-MGC', strategy: 'liquidity_sweep_reclaim', direction: 'LONG', entry_zone: [2409.8, 2410.7], stop: 2406.0, tp1: 2416.1, tp2: 2419.4, suggested_size: 3, risk_budget: 150, max_risk_usd: 150, risk_per_contract: 42, quality_score: 0.69, final_rank_score: 14.6 }, candidates: [] } };

function useApiData() {
  const [dashboard, setDashboard] = useState(FALLBACK_DASHBOARD);
  const [signals, setSignals] = useState(FALLBACK_SIGNALS);
  const [audit, setAudit] = useState(FALLBACK_AUDIT);
  const [brokers, setBrokers] = useState(FALLBACK_BROKERS);
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [decisions, setDecisions] = useState(FALLBACK_DECISIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDecisions = async () => {
    try {
      const symbols = ['MES', 'MNQ', 'MYM', 'MGC'];
      const responses = await Promise.all(symbols.map((symbol) => fetch(`${API_BASE}/decision/demo?symbol=${symbol}`)));
      const json = await Promise.all(responses.map((res, idx) => (res.ok ? res.json() : Promise.resolve(FALLBACK_DECISIONS[symbols[idx]]))));
      const mapped = symbols.reduce((acc, symbol, idx) => { acc[symbol] = json[idx] || FALLBACK_DECISIONS[symbol]; return acc; }, {});
      setDecisions(mapped);
    } catch { setDecisions(FALLBACK_DECISIONS); }
  };

  useEffect(() => { loadDecisions().finally(() => setLoading(false)); }, []);
  return { dashboard, signals, audit, brokers, settings, decisions, loading, error, reload: loadDecisions, approveSignal: async () => ({ ok: true }), testBroker: async () => ({ ok: true }), updateBackendSettings: async () => ({ ok: true }) };
}

function HeaderBar({ loading, error, onRefresh }) {
  return (<div className="mb-5 flex items-center justify-between gap-3"><div><div className="text-[28px] font-semibold tracking-[-0.03em]" style={{ color: COLORS.textStrong }}>NexTrade AI</div><div className="mt-1 text-[12px]" style={{ color: error ? COLORS.amber : COLORS.textMuted }}>{loading ? 'Refreshing desk state…' : error || 'Connected to backend state'}</div></div><Button className="min-h-[44px]" variant="outline" style={secondaryButtonStyle()} onClick={onRefresh}>Refresh</Button></div>);
}

function Home({ decisions }) {
  const [instrumentFilter, setInstrumentFilter] = useState('ALL');
  const [selectedIdeaId, setSelectedIdeaId] = useState(null);
  const decisionIdeas = useMemo(() => Object.values(decisions || {}).map((decision) => { const best = decision?.best_trade || {}; return { id: best.candidate_id || `DEC-${decision.instrument}`, symbol: decision.instrument, direction: best.direction || 'WATCH', entry_zone: best.entry_zone || [], stop: best.stop, tp1: best.tp1, tp2: best.tp2, confidence: best.quality_score ?? decision.regime_confidence ?? 0, ranking_score: best.final_rank_score ?? 0, strategy: best.strategy || decision.recommended_strategy || 'defensive_sit_out', regime: decision.top_regime || 'unknown', suggested_size: best.suggested_size || 0, max_risk_usd: best.risk_budget ?? best.max_risk_usd ?? 0, state: decision.decision === 'NO_TRADE' ? 'blocked' : 'decision_live', notes: (decision.risk_gate?.warnings || []).join(' · ') || (decision.decision === 'NO_TRADE' ? 'No trade recommended' : 'Decision engine active') }; }).sort((a, b) => (b.ranking_score || 0) - (a.ranking_score || 0)), [decisions]);
  const todayIdeas = decisionIdeas; const filtered = instrumentFilter === 'ALL' ? todayIdeas : todayIdeas.filter((s) => s.symbol === instrumentFilter); const defaultTop = filtered[0] || todayIdeas[0]; const top = filtered.find((s) => s.id === selectedIdeaId) || defaultTop; const blockedToday = todayIdeas.filter((s) => String(s.state).toLowerCase() === 'blocked');
  return <div className="space-y-6"><RowPanel><div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: COLORS.textStrong }}><span>{top ? `${top.direction === 'LONG' ? 'Bullish' : top.direction === 'SHORT' ? 'Bearish' : 'Neutral'}` : 'No bias'}</span><span style={{ color: COLORS.textMuted }}>•</span><span style={{ color: COLORS.accent }}>{top ? `${top.symbol} ${top.strategy}` : 'No setup'}</span><span style={{ color: COLORS.textMuted }}>•</span><span style={{ color: COLORS.green }}>{top ? `${Math.round((top.confidence || 0) * 100)}%` : '—'}</span><span style={{ color: COLORS.textMuted }}>•</span><span style={{ color: COLORS.red }}>{blockedToday.length ? 'Event / risk active' : 'No major lockout'}</span></div></RowPanel><div className="mb-3 flex gap-2 overflow-x-auto pb-1">{['ALL','MES','MNQ','MYM','MGC'].map((label)=><Pill key={label} label={label} active={instrumentFilter===label} onClick={()=>setInstrumentFilter(label)} />)}</div>{top && <HeroCard><div className="flex items-start justify-between gap-3"><div><div className="mb-2 flex items-center gap-2"><DirectionPill direction={top.direction} /><StatusBadge status={top.state} /></div><div className="text-[28px] font-semibold tracking-[-0.03em] leading-8" style={{ color: COLORS.textStrong }}>{top.symbol} {top.direction}</div><div className="mt-2 text-[15px] leading-6" style={{ color: COLORS.textSoft }}>{top.strategy} · {top.regime} · score {Number(top.ranking_score || 0).toFixed(2)}</div></div><div className="text-right"><div className="text-[12px]" style={{ color: COLORS.textMuted }}>Confidence</div><div className="mt-1 text-[18px] font-semibold" style={{ color: top.direction === 'WATCH' ? COLORS.amber : COLORS.green }}>{Math.round((top.confidence || 0) * 100)}%</div></div></div><div className="mt-5 grid grid-cols-2 gap-4"><MetricStack label="Entry" value={top.entry_zone?.length ? top.entry_zone.join(' - ') : 'Stand aside'} mono /><MetricStack label="Stop" value={top.stop != null ? String(top.stop) : '—'} tone="bad" mono /><MetricStack label="TP1" value={top.tp1 != null ? String(top.tp1) : '—'} tone="good" mono /><MetricStack label="TP2" value={top.tp2 != null ? String(top.tp2) : '—'} tone="good" mono /></div><div className="mt-5 grid grid-cols-2 gap-4"><MetricStack label="Sizing" value={top.suggested_size ? `${top.suggested_size} contracts` : '0 contracts'} /><MetricStack label="Max risk" value={`$${top.max_risk_usd || 0}`} tone="warn" mono /></div></HeroCard>}<section><SectionHeader title="Ranked Trade Ideas" subtitle="Tap any runner-up trade to load it into the main idea card above." /><div className="space-y-3">{filtered.map((s,index)=>{const active=top?.id===s.id; return <Surface key={s.id} className={index===0?'border':''}><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><div className="text-[17px] font-medium tracking-[-0.02em]" style={{ color: COLORS.textStrong }}>{s.symbol} {s.direction}</div><DirectionPill direction={s.direction} /></div><div className="mt-2 text-[13px] leading-5" style={{ color: COLORS.textSoft }}>{s.strategy} · Entry {s.entry_zone?.join(' - ') || 'Stand aside'}</div></div><div className="flex flex-col items-end gap-2"><StatusBadge status={s.state} /><Button className="min-h-[44px]" variant="outline" style={secondaryButtonStyle()} onClick={()=>setSelectedIdeaId(s.id)}>{active ? 'Selected' : 'Load'}</Button></div></div></Surface>;})}</div></section></div>;
}

function Playbooks() { const items = Object.entries(PLAYBOOK_LIBRARY).map(([name, value]) => ({ name, ...value })); return <div className="space-y-6"><SectionHeader title="Playbooks" subtitle="Strategy definitions used by the ranking engine." /> <div className="space-y-3">{items.map((p)=><Surface key={p.name}><div className="text-[16px] font-semibold" style={{ color: COLORS.textStrong }}>{p.name}</div><div className="mt-2 text-[13px] leading-6" style={{ color: COLORS.textSoft }}>{p.conditions}</div><div className="mt-2 text-[12px]" style={{ color: COLORS.accent }}>Regime: {p.regime}</div><div className="mt-1 text-[12px]" style={{ color: COLORS.red }}>Invalidation: {p.invalidation}</div></Surface>)}</div></div>; }

export default function App() { const [tab, setTab] = useState('home'); const { decisions, loading, error, reload } = useApiData(); return <div style={{ background: COLORS.bg, color: COLORS.text }} className="min-h-screen p-4 pb-28"><HeaderBar loading={loading} error={error} onRefresh={reload} />{tab==='home' && <Home decisions={decisions} />}{tab==='playbooks' && <Playbooks />}{tab!=='home' && tab!=='playbooks' && <Surface><div className="text-[13px]" style={{ color: COLORS.textMuted }}>This shell is intentionally slim in GitHub. The full prototype remains the source of truth for continued UI work.</div></Surface>}<div className="fixed bottom-0 left-0 right-0 border-t px-2 pb-2 pt-2" style={{ background: 'rgba(15,17,19,0.96)', borderColor: COLORS.border }}><div className="grid grid-cols-8 gap-1 text-[11px]">{[['home','Home'],['markets','Markets'],['signals','Signals'],['charts','Charts'],['journal','Journal'],['automation','Auto'],['settings','Settings'],['playbooks','Playbooks']].map(([key,label])=><button key={key} onClick={()=>setTab(key)} className="min-h-[48px] rounded-xl px-1" style={{ color: tab===key ? COLORS.textStrong : COLORS.textMuted, background: tab===key ? COLORS.cardElevated : 'transparent' }}>{label}</button>)}</div></div></div>; }
