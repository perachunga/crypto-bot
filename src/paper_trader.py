"""
Paper Trader — ejecución simulada.
Usa KellySizer con Bayesian blending para sizing desde el trade 0.
"""
import uuid
from datetime import datetime
from strategies.base import Signal
from database import (
    save_trade, save_position, delete_position, get_positions,
    get_positions_by_strategy, save_equity_snapshot,
    get_strategy_metrics, reset_strategy_db
)
from config import INITIAL_CAPITAL, LEVERAGE
from indicators.math_utils import KellySizer


# KellySizers por estrategia (prior viene del kelly_prior de cada Strategy class)
_sizers: dict[str, KellySizer] = {}

def _get_sizer(strategy_name: str, prior: dict) -> KellySizer:
    if strategy_name not in _sizers:
        _sizers[strategy_name] = KellySizer(
            prior_win_rate=prior.get("win_rate", 0.45),
            prior_rr=prior.get("rr", 1.5),
        )
    return _sizers[strategy_name]


class PaperTrader:
    def __init__(self):
        self._capital:   dict[str, float] = {}
        self._positions: dict[str, dict]  = {}
        self._reload_positions()

    def _reload_positions(self):
        for pos in get_positions():
            self._positions[pos["id"]] = pos

    def _get_capital(self, strategy_name: str) -> float:
        if strategy_name not in self._capital:
            self._capital[strategy_name] = INITIAL_CAPITAL
        return self._capital[strategy_name]

    def _calc_size(self, signal: Signal, kelly_prior: dict) -> float:
        """
        Kelly sizing desde el trade 0 usando Bayesian blending.
        Si la señal trae size_usdt explícito, se respeta.
        """
        if signal.size_usdt:
            return signal.size_usdt

        capital = self._get_capital(signal.strategy_name)
        metrics = get_strategy_metrics(signal.strategy_name)
        sizer   = _get_sizer(signal.strategy_name, kelly_prior)

        n        = metrics["trades"]
        wr       = metrics["win_rate"] / 100 if n > 0 else None
        avg_win  = metrics["avg_win"]        if n > 0 and metrics["avg_win"]  > 0 else None
        avg_loss = metrics["avg_loss"]       if n > 0 and metrics["avg_loss"] < 0 else None

        size = sizer.size_usdt(capital, n, wr, avg_win, avg_loss)
        # Mínimo $100 de margen, máximo 20% del capital
        return max(100.0, min(size, capital * 0.20))

    # ── Gestión de posiciones ─────────────────────────────────────────────────

    def open_position(self, signal: Signal, kelly_prior: dict | None = None) -> dict | None:
        prior = kelly_prior or {"win_rate": 0.45, "rr": 1.5}

        # Estrategias normales: 1 posición por símbolo
        # MarketMaker: permite múltiples posiciones (inventory tracking)
        is_mm = signal.strategy_name == "MarketMaker"
        if not is_mm:
            for pos in self._positions.values():
                if pos["strategy_name"] == signal.strategy_name and pos["symbol"] == signal.symbol:
                    return None

        size    = self._calc_size(signal, prior)
        capital = self._get_capital(signal.strategy_name)

        if size > capital:
            return None

        position = {
            "id":            str(uuid.uuid4()),
            "strategy_name": signal.strategy_name,
            "symbol":        signal.symbol,
            "side":          signal.side,
            "entry_price":   signal.entry_price,
            "size":          round(size, 2),
            "stop_loss":     signal.stop_loss,
            "take_profit":   signal.take_profit,
            "opened_at":     datetime.utcnow(),
        }

        self._positions[position["id"]] = position
        self._capital[signal.strategy_name] = capital - size
        save_position(position)

        print(
            f"[OPEN] {signal.strategy_name} {signal.symbol} {signal.side.upper()} "
            f"@ {signal.entry_price} | ${size:.0f} | kelly | {signal.reason}"
        )
        return position

    def open_mm_position(self, event: dict) -> dict | None:
        """Abre una posición desde el market maker (event dict del tick handler)."""
        signal = Signal(
            strategy_name="MarketMaker",
            symbol=event["symbol"],
            side=event["side"],
            entry_price=event["entry_price"],
            confidence=1.0,
            reason=event.get("reason", "MM fill"),
            size_usdt=event.get("size", 150.0),
        )
        return self.open_position(signal, kelly_prior={"win_rate": 0.55, "rr": 1.0})

    def close_position(self, position_id: str, exit_price: float, reason: str) -> dict | None:
        if position_id not in self._positions:
            return None

        pos   = self._positions.pop(position_id)
        entry = pos["entry_price"]
        size  = pos["size"]

        pnl = (
            (exit_price - entry) / entry * size * LEVERAGE if pos["side"] == "long"
            else (entry - exit_price) / entry * size * LEVERAGE
        )
        pnl_pct  = pnl / size * 100
        strategy = pos["strategy_name"]

        trade = {
            "id":            str(uuid.uuid4()),
            "strategy_name": strategy,
            "symbol":        pos["symbol"],
            "side":          pos["side"],
            "entry_price":   entry,
            "exit_price":    exit_price,
            "size":          size,
            "pnl":           round(pnl, 4),
            "pnl_pct":       round(pnl_pct, 2),
            "opened_at":     pos["opened_at"],
            "closed_at":     datetime.utcnow(),
            "reason_entry":  pos.get("reason_entry", ""),
            "reason_exit":   reason,
        }

        self._capital[strategy] = self._get_capital(strategy) + size + pnl
        save_trade(trade)
        delete_position(position_id)

        tag = f"+${pnl:.2f}" if pnl >= 0 else f"-${abs(pnl):.2f}"
        print(f"[CLOSE] {strategy} @ {exit_price} | {tag} ({pnl_pct:.1f}%) | {reason}")

        save_equity_snapshot({
            "id":            str(uuid.uuid4()),
            "strategy_name": strategy,
            "equity":        round(self._capital[strategy], 2),
            "timestamp":     datetime.utcnow(),
        })

        return trade

    def close_mm_position(self, event: dict) -> dict | None:
        """Cierra la posición MM correspondiente y registra PnL directo."""
        # Buscar posición MM del mismo símbolo y lado
        symbol = event["symbol"]
        side   = event["side"]
        for pos_id, pos in list(self._positions.items()):
            if pos["strategy_name"] == "MarketMaker" and pos["symbol"] == symbol and pos["side"] == side:
                return self.close_position(pos_id, event["exit_price"], event.get("reason", "MM close"))
        return None

    def reset_strategy(self, strategy_name: str, current_prices: dict[str, float]) -> dict:
        closed = []
        for pos_id, pos in list(self._positions.items()):
            if pos["strategy_name"] != strategy_name:
                continue
            price = current_prices.get(pos["symbol"], pos["entry_price"])
            trade = self.close_position(pos_id, price, "MANUAL_RESET")
            if trade:
                closed.append(trade)

        self._capital[strategy_name] = INITIAL_CAPITAL
        if strategy_name in _sizers:
            del _sizers[strategy_name]   # resetear el KellySizer también

        reset_strategy_db(strategy_name)
        save_equity_snapshot({
            "id":            str(uuid.uuid4()),
            "strategy_name": strategy_name,
            "equity":        INITIAL_CAPITAL,
            "timestamp":     datetime.utcnow(),
        })

        print(f"[RESET] {strategy_name} → ${INITIAL_CAPITAL} | {len(closed)} pos cerradas")
        return {"strategy": strategy_name, "closed_positions": len(closed), "new_capital": INITIAL_CAPITAL}

    def get_open_positions(self) -> list[dict]:
        return list(self._positions.values())

    def get_unrealized_pnl(self, current_prices: dict[str, float]) -> dict[str, float]:
        result = {}
        for pos_id, pos in self._positions.items():
            price = current_prices.get(pos["symbol"])
            if price is None:
                continue
            entry = pos["entry_price"]
            size  = pos["size"]
            upnl  = (
                (price - entry) / entry * size * LEVERAGE if pos["side"] == "long"
                else (entry - price) / entry * size * LEVERAGE
            )
            result[pos_id] = round(upnl, 4)
        return result

    def get_equity_summary(self) -> dict[str, float]:
        return {name: round(cap, 2) for name, cap in self._capital.items()}
