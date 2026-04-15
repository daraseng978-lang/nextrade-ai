from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title='NexTrade Decision API', version='0.1.0')


class MarketSnapshot(BaseModel):
    symbol: Literal['MES', 'MNQ', 'MYM', 'MGC']
    current_price: float
    prior_high: float
    prior_low: float
    prior_close: float
    overnight_high: float
    overnight_low: float
    weekly_high: float
    weekly_low: float
    atr_14: float
    vwap: float
    vwap_slope: float = Field(description='Positive = rising, negative = falling')
    volume_ratio: float = Field(description='Current relative volume vs normal')
    gap_from_close: float
    vix: float
    vix_change_pct: float
    dxy_change_pct: float
    yield_10y_change_bps: float
    cross_market_alignment: float = Field(ge=-1.0, le=1.0, description='-1 bearish conflict, +1 strong alignment')
    minutes_to_high_impact_event: Optional[int] = None
    session: Literal['PRE', 'NY', 'PM'] = 'NY'


class RiskProfile(BaseModel):
    mode: Literal['raw', 'one_contract', 'fixed_dollar', 'percent_account'] = 'fixed_dollar'
    fixed_dollar_risk: float = 150.0
    account_size: float = 50000.0
    percent_account_risk: float = 0.003
    max_contracts: int = 3


class DecisionRequest(BaseModel):
    snapshot: MarketSnapshot
    risk: RiskProfile = Field(default_factory=RiskProfile)


class CheckResult(BaseModel):
    code: str
    passed: bool
    message: str


POINT_VALUES = {
    'MES': 5.0,
    'MNQ': 2.0,
    'MYM': 0.5,
    'MGC': 10.0,
}

PLAYBOOKS_BY_REGIME = {
    'strong_trend_up': ['trend_pullback_continuation', 'opening_range_breakout', 'expansion_breakout'],
    'strong_trend_down': ['trend_pullback_continuation', 'opening_range_breakout', 'expansion_breakout'],
    'balanced_range': ['balanced_auction_rotation', 'vwap_reclaim', 'liquidity_sweep_reclaim'],
    'expansion_breakout': ['opening_range_breakout', 'expansion_breakout', 'liquidity_sweep_reclaim'],
    'reversal_mean_reversion': ['counter_trend_fade', 'vwap_reclaim', 'liquidity_sweep_reclaim'],
    'event_driven_high_risk': ['defensive_sit_out'],
    'low_quality_no_trade': ['defensive_sit_out'],
}


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def normalize_probs(raw: Dict[str, float]) -> Dict[str, float]:
    floored = {k: max(v, 0.0001) for k, v in raw.items()}
    total = sum(floored.values())
    return {k: round(v / total, 4) for k, v in floored.items()}


def price_position(snapshot: MarketSnapshot) -> float:
    span = max(snapshot.prior_high - snapshot.prior_low, 0.01)
    return (snapshot.current_price - snapshot.prior_low) / span


def overnight_range(snapshot: MarketSnapshot) -> float:
    return max(snapshot.overnight_high - snapshot.overnight_low, 0.0)


def atr_consumed(snapshot: MarketSnapshot) -> float:
    return overnight_range(snapshot) / max(snapshot.atr_14, 0.01)


def run_risk_gate(snapshot: MarketSnapshot) -> Dict:
    checks: List[CheckResult] = []

    def add(code: str, passed: bool, message: str):
        checks.append(CheckResult(code=code, passed=passed, message=message))

    event_lock = snapshot.minutes_to_high_impact_event is not None and snapshot.minutes_to_high_impact_event <= 120
    atr_exhausted = atr_consumed(snapshot) >= 0.9
    elevated_vol = snapshot.vix > 25 or snapshot.vix_change_pct >= 20
    cross_conflict = snapshot.cross_market_alignment < -0.2

    add('macro_event_lockout', not event_lock, 'No major event inside 2 hours' if not event_lock else 'High-impact event inside 2 hours')
    add('atr_consumed_overnight', not atr_exhausted, 'Overnight ATR still available' if not atr_exhausted else 'Overnight move already consumed most ATR')
    add('elevated_volatility', not elevated_vol, 'Volatility normal' if not elevated_vol else 'VIX elevated or spiking')
    add('conflicting_cross_market', not cross_conflict, 'Cross-market aligned enough' if not cross_conflict else 'Cross-market signals conflict')

    blocked = event_lock or elevated_vol
    warnings = [c.message for c in checks if not c.passed]
    return {'blocked': blocked, 'checks': [c.model_dump() for c in checks], 'warnings': warnings}


def classify_regime(snapshot: MarketSnapshot) -> Dict:
    pos = price_position(snapshot)
    atr_used = atr_consumed(snapshot)
    above_vwap = snapshot.current_price > snapshot.vwap
    near_weekly_high = snapshot.current_price >= snapshot.weekly_high * 0.998
    near_weekly_low = snapshot.current_price <= snapshot.weekly_low * 1.002

    raw = {
        'strong_trend_up': 0.1,
        'strong_trend_down': 0.1,
        'balanced_range': 0.1,
        'expansion_breakout': 0.1,
        'reversal_mean_reversion': 0.1,
        'event_driven_high_risk': 0.1,
        'low_quality_no_trade': 0.1,
    }

    if above_vwap and snapshot.vwap_slope > 0 and snapshot.cross_market_alignment > 0.2:
        raw['strong_trend_up'] += 1.2
    if (not above_vwap) and snapshot.vwap_slope < 0 and snapshot.cross_market_alignment < -0.2:
        raw['strong_trend_down'] += 1.2
    if abs(snapshot.vwap_slope) < 0.05 and atr_used < 0.5:
        raw['balanced_range'] += 1.0
    if atr_used >= 0.7 and (near_weekly_high or near_weekly_low):
        raw['expansion_breakout'] += 1.1
    if atr_used >= 0.8 and abs(snapshot.current_price - snapshot.vwap) > snapshot.atr_14 * 0.2:
        raw['reversal_mean_reversion'] += 0.8
    if snapshot.minutes_to_high_impact_event is not None and snapshot.minutes_to_high_impact_event <= 120:
        raw['event_driven_high_risk'] += 1.4
    if snapshot.cross_market_alignment < -0.2 or snapshot.volume_ratio < 0.7:
        raw['low_quality_no_trade'] += 0.8
    if pos > 0.75:
        raw['strong_trend_up'] += 0.3
    if pos < 0.25:
        raw['strong_trend_down'] += 0.3

    probs = normalize_probs(raw)
    top = max(probs, key=probs.get)
    return {
        'top_regime': top,
        'regime_confidence': probs[top],
        'regime_probs': probs,
    }


def score_strategies(snapshot: MarketSnapshot, regime: Dict) -> Dict:
    top_regime = regime['top_regime']
    probs = regime['regime_probs']
    scores = {
        'trend_pullback_continuation': 0.05,
        'opening_range_breakout': 0.05,
        'expansion_breakout': 0.05,
        'balanced_auction_rotation': 0.05,
        'vwap_reclaim': 0.05,
        'liquidity_sweep_reclaim': 0.05,
        'counter_trend_fade': 0.05,
        'defensive_sit_out': 0.05,
    }

    for strat in PLAYBOOKS_BY_REGIME.get(top_regime, []):
        scores[strat] += 0.35

    scores['trend_pullback_continuation'] += probs['strong_trend_up'] * 0.4 + probs['strong_trend_down'] * 0.4
    scores['opening_range_breakout'] += probs['expansion_breakout'] * 0.4
    scores['expansion_breakout'] += probs['expansion_breakout'] * 0.45
    scores['balanced_auction_rotation'] += probs['balanced_range'] * 0.45
    scores['vwap_reclaim'] += probs['reversal_mean_reversion'] * 0.35 + probs['balanced_range'] * 0.2
    scores['liquidity_sweep_reclaim'] += probs['reversal_mean_reversion'] * 0.3 + probs['expansion_breakout'] * 0.1
    scores['counter_trend_fade'] += probs['reversal_mean_reversion'] * 0.35
    scores['defensive_sit_out'] += probs['event_driven_high_risk'] * 0.45 + probs['low_quality_no_trade'] * 0.4

    if snapshot.minutes_to_high_impact_event is not None and snapshot.minutes_to_high_impact_event <= 120:
        scores['defensive_sit_out'] += 0.4
    if atr_consumed(snapshot) > 0.9:
        scores['defensive_sit_out'] += 0.2
    if snapshot.cross_market_alignment > 0.35:
        scores['trend_pullback_continuation'] += 0.1
        scores['opening_range_breakout'] += 0.05

    probs_out = normalize_probs(scores)
    top = max(probs_out, key=probs_out.get)
    return {'recommended_strategy': top, 'strategy_scores': probs_out}


def generate_candidates(snapshot: MarketSnapshot, strategy_scores: Dict) -> List[Dict]:
    direction = 'LONG' if snapshot.current_price >= snapshot.vwap else 'SHORT'
    candidates: List[Dict] = []
    top_three = sorted(strategy_scores['strategy_scores'].items(), key=lambda x: x[1], reverse=True)[:3]

    for strat, score in top_three:
        if strat == 'defensive_sit_out':
            candidates.append({
                'candidate_id': f'CAND-{uuid4().hex[:6].upper()}',
                'strategy': strat,
                'direction': 'WATCH',
                'entry_zone': [],
                'stop': None,
                'tp1': None,
                'tp2': None,
                'invalidations': ['Risk or structure improves enough to justify a new setup'],
                'reasoning_tags': ['no_trade', 'defensive'],
                'strategy_score': score,
            })
            continue

        if direction == 'LONG':
            entry_low = round(max(snapshot.vwap, snapshot.current_price - snapshot.atr_14 * 0.08), 2)
            entry_high = round(entry_low + snapshot.atr_14 * 0.03, 2)
            stop = round(entry_low - snapshot.atr_14 * 0.12, 2)
            tp1 = round(entry_high + snapshot.atr_14 * 0.18, 2)
            tp2 = round(entry_high + snapshot.atr_14 * 0.28, 2)
        else:
            entry_high = round(min(snapshot.vwap, snapshot.current_price + snapshot.atr_14 * 0.08), 2)
            entry_low = round(entry_high - snapshot.atr_14 * 0.03, 2)
            stop = round(entry_high + snapshot.atr_14 * 0.12, 2)
            tp1 = round(entry_low - snapshot.atr_14 * 0.18, 2)
            tp2 = round(entry_low - snapshot.atr_14 * 0.28, 2)

        candidates.append({
            'candidate_id': f'CAND-{uuid4().hex[:6].upper()}',
            'strategy': strat,
            'direction': direction,
            'entry_zone': [entry_low, entry_high],
            'stop': stop,
            'tp1': tp1,
            'tp2': tp2,
            'invalidations': ['Structure breaks through invalidation level', 'Cross-market alignment deteriorates'],
            'reasoning_tags': ['playbook_fit', 'atr_room', 'cross_market'],
            'strategy_score': score,
        })
    return candidates


def size_candidate(snapshot: MarketSnapshot, risk: RiskProfile, candidate: Dict) -> Dict:
    if candidate['direction'] == 'WATCH' or not candidate['entry_zone']:
        return {'risk_budget': 0, 'risk_per_contract': 0, 'suggested_size': 0, 'risk_mode': risk.mode}

    entry_mid = sum(candidate['entry_zone']) / 2
    stop_distance = abs(entry_mid - candidate['stop'])
    risk_per_contract = stop_distance * POINT_VALUES[snapshot.symbol]

    if risk.mode == 'raw':
        budget = 0
        size = 0
    elif risk.mode == 'one_contract':
        budget = risk_per_contract
        size = 1
    elif risk.mode == 'percent_account':
        budget = risk.account_size * risk.percent_account_risk
        size = int(budget // max(risk_per_contract, 0.01))
    else:
        budget = risk.fixed_dollar_risk
        size = int(budget // max(risk_per_contract, 0.01))

    size = max(0, min(size, risk.max_contracts))
    return {
        'risk_budget': round(budget, 2),
        'risk_per_contract': round(risk_per_contract, 2),
        'suggested_size': size,
        'risk_mode': risk.mode,
    }


def rank_candidates(snapshot: MarketSnapshot, regime: Dict, candidates: List[Dict], risk_gate: Dict) -> Dict:
    ranked = []
    no_trade_score = 0.15
    if risk_gate['blocked']:
        no_trade_score += 0.5
    no_trade_score += regime['regime_probs'].get('event_driven_high_risk', 0) * 0.3
    no_trade_score += regime['regime_probs'].get('low_quality_no_trade', 0) * 0.25
    no_trade_score = round(clamp(no_trade_score, 0.0, 0.99), 4)

    for candidate in candidates:
        if candidate['direction'] == 'WATCH':
            quality = round(no_trade_score, 4)
            ev = 0.0
            factor_scores = {
                'cross_market_alignment': 0,
                'relative_strength': 0,
                'volume_confirmation': 0,
                'playbook_match': 0,
                'historical_win_rate': 0,
                'atr_extension_penalty': 0,
                'event_risk_penalty': -4 if risk_gate['blocked'] else 0,
                'counter_trend_penalty': 0,
                'confidence_calibration': 0,
            }
            final = round(sum(factor_scores.values()), 2)
        else:
            factor_scores = {
                'cross_market_alignment': round(snapshot.cross_market_alignment * 10, 2),
                'relative_strength': round(max(snapshot.cross_market_alignment, 0) * 8, 2),
                'volume_confirmation': round(clamp(snapshot.volume_ratio - 1, -1, 1) * 5, 2),
                'playbook_match': round(candidate['strategy_score'] * 5, 2),
                'historical_win_rate': 3.0,
                'atr_extension_penalty': round(-clamp(atr_consumed(snapshot), 0, 1.5) * 6, 2),
                'event_risk_penalty': -6.0 if risk_gate['blocked'] else (-3.0 if snapshot.minutes_to_high_impact_event and snapshot.minutes_to_high_impact_event < 180 else 0.0),
                'counter_trend_penalty': -4.0 if (candidate['direction'] == 'LONG' and regime['top_regime'] == 'strong_trend_down') or (candidate['direction'] == 'SHORT' and regime['top_regime'] == 'strong_trend_up') else 0.0,
                'confidence_calibration': 0.0,
            }
            weighted = round(sum(factor_scores.values()), 2)
            quality = round(clamp(0.45 + candidate['strategy_score'] * 0.35 + regime['regime_confidence'] * 0.25 - (0.15 if risk_gate['blocked'] else 0), 0.01, 0.99), 4)
            ev = round(max(weighted / 20.0, 0.0), 4)
            final = round(weighted + quality, 2)

        ranked.append({
            **candidate,
            'factor_scores': factor_scores,
            'quality_score': quality,
            'expected_value_score': ev,
            'final_rank_score': final,
        })

    ranked.sort(key=lambda x: x['final_rank_score'], reverse=True)
    best = ranked[0] if ranked else None
    decision = 'NO_TRADE' if (best is None or best['direction'] == 'WATCH' or no_trade_score > best['quality_score']) else 'TRADE'

    return {
        'ranked_candidates': ranked,
        'best_trade': best,
        'no_trade_score': no_trade_score,
        'decision': decision,
    }


def explain_decision(snapshot: MarketSnapshot, regime: Dict, strategy: Dict, ranking: Dict, risk_gate: Dict) -> Dict:
    reasons = []
    if regime['top_regime'] == 'strong_trend_up':
        reasons.append('Price and VWAP structure favor an upward trend regime')
    if regime['top_regime'] == 'balanced_range':
        reasons.append('Flat VWAP and contained overnight range favor balance')
    if risk_gate['blocked']:
        reasons.append('A hard risk gate is active, so no-trade is elevated')
    reasons.append(f"Top strategy is {strategy['recommended_strategy']} with probability {round(strategy['strategy_scores'][strategy['recommended_strategy']] * 100)}%")
    return {'reasons': reasons}


@app.get('/decision/demo')
def demo_decision(symbol: Literal['MES', 'MNQ', 'MYM', 'MGC'] = 'MES'):
    seeds = {
        'MES': MarketSnapshot(symbol='MES', current_price=5298, prior_high=5292, prior_low=5258, prior_close=5274, overnight_high=5291, overnight_low=5279, weekly_high=5302, weekly_low=5205, atr_14=54, vwap=5288, vwap_slope=0.22, volume_ratio=1.1, gap_from_close=24, vix=18.4, vix_change_pct=-3.2, dxy_change_pct=-0.15, yield_10y_change_bps=-2.0, cross_market_alignment=0.62, minutes_to_high_impact_event=190, session='NY'),
        'MNQ': MarketSnapshot(symbol='MNQ', current_price=18442, prior_high=18418, prior_low=18290, prior_close=18335, overnight_high=18424, overnight_low=18360, weekly_high=18480, weekly_low=18020, atr_14=210, vwap=18398, vwap_slope=0.28, volume_ratio=1.2, gap_from_close=107, vix=18.4, vix_change_pct=-3.2, dxy_change_pct=-0.15, yield_10y_change_bps=-2.0, cross_market_alignment=0.69, minutes_to_high_impact_event=190, session='NY'),
        'MYM': MarketSnapshot(symbol='MYM', current_price=40120, prior_high=40180, prior_low=39910, prior_close=40010, overnight_high=40110, overnight_low=40030, weekly_high=40210, weekly_low=39480, atr_14=320, vwap=40085, vwap_slope=0.08, volume_ratio=0.86, gap_from_close=110, vix=18.4, vix_change_pct=-3.2, dxy_change_pct=-0.15, yield_10y_change_bps=-2.0, cross_market_alignment=0.22, minutes_to_high_impact_event=190, session='NY'),
        'MGC': MarketSnapshot(symbol='MGC', current_price=2412.3, prior_high=2414.2, prior_low=2388.0, prior_close=2391.4, overnight_high=2416.1, overnight_low=2398.2, weekly_high=2418.5, weekly_low=2324.0, atr_14=31.5, vwap=2404.6, vwap_slope=0.18, volume_ratio=1.04, gap_from_close=20.9, vix=18.4, vix_change_pct=-3.2, dxy_change_pct=-0.15, yield_10y_change_bps=-2.0, cross_market_alignment=0.31, minutes_to_high_impact_event=190, session='NY'),
    }
    return make_decision(DecisionRequest(snapshot=seeds[symbol]))


@app.post('/decision')
def make_decision(request: DecisionRequest):
    snapshot = request.snapshot
    risk_gate = run_risk_gate(snapshot)
    regime = classify_regime(snapshot)
    strategy = score_strategies(snapshot, regime)
    candidates = generate_candidates(snapshot, strategy)

    sized_candidates = []
    for candidate in candidates:
        sizing = size_candidate(snapshot, request.risk, candidate)
        sized_candidates.append({**candidate, **sizing})

    ranking = rank_candidates(snapshot, regime, sized_candidates, risk_gate)
    explanation = explain_decision(snapshot, regime, strategy, ranking, risk_gate)

    signal_id = f'SIG-{uuid4().hex[:8].upper()}'
    best_trade = ranking['best_trade']
    validation = {
        'blocked': risk_gate['blocked'],
        'checks': risk_gate['checks'],
    }

    output = {
        'signal_id': signal_id,
        'instrument': snapshot.symbol,
        'decision': ranking['decision'],
        'top_regime': regime['top_regime'],
        'regime_probs': regime['regime_probs'],
        'regime_confidence': regime['regime_confidence'],
        'recommended_strategy': strategy['recommended_strategy'],
        'strategy_scores': strategy['strategy_scores'],
        'candidates': ranking['ranked_candidates'],
        'best_trade': best_trade,
        'no_trade_score': ranking['no_trade_score'],
        'risk_gate': risk_gate,
        'validation': validation,
        'explanation': explanation,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'expires_at': (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat(),
    }
    return output


@app.get('/health')
def health():
    return {'ok': True, 'service': 'decision-api'}
