"""
Clase base para todas las estrategias.
"""
from dataclasses import dataclass, field
from datetime import datetime
from abc import ABC, abstractmethod


@dataclass
class Signal:
    strategy_name: str
    symbol:        str
    side:          str        # 'long' | 'short'
    entry_price:   float
    confidence:    float      # 0.0 – 1.0
    reason:        str
    stop_loss:     float | None = None
    take_profit:   float | None = None
    size_usdt:     float | None = None   # None → KellySizer lo calcula
    timestamp:     datetime = field(default_factory=datetime.utcnow)


class Strategy(ABC):
    name:   str  = "base"
    params: dict = {}

    # ── Kelly prior ───────────────────────────────────────────────────────────
    # Cada estrategia define su R/R esperado para que Kelly funcione desde 0.
    # prior_win_rate: WR esperado conservador
    # prior_rr: ratio TP/SL esperado
    kelly_prior: dict = {"win_rate": 0.45, "rr": 1.5}

    # ── Tick-based (opt-in) ───────────────────────────────────────────────────
    # Si la estrategia necesita operar en cada tick, sobreescribir on_tick().
    tick_based: bool = False

    @abstractmethod
    def analyze(
        self,
        symbol:    str,
        candles:   list[dict],
        orderbook: dict | None = None,
    ) -> Signal | None:
        ...

    def on_tick(
        self,
        symbol:    str,
        tick:      dict,
        candles:   list[dict],
        orderbook: dict | None = None,
    ) -> list[dict]:
        """
        Llamado en cada aggTrade tick. Solo activo si tick_based=True.
        Devuelve lista de eventos: [{'type': 'open'|'close', ...}]
        Las estrategias candle-based no implementan esto.
        """
        return []

    def should_exit(
        self,
        position:  dict,
        candles:   list[dict],
        orderbook: dict | None = None,
    ) -> tuple[bool, str]:
        current_price = candles[-1]["close"]
        side  = position["side"]
        sl    = position.get("stop_loss")
        tp    = position.get("take_profit")

        if side == "long":
            if sl and current_price <= sl:
                return True, f"stop_loss hit @ {current_price}"
            if tp and current_price >= tp:
                return True, f"take_profit hit @ {current_price}"
        elif side == "short":
            if sl and current_price >= sl:
                return True, f"stop_loss hit @ {current_price}"
            if tp and current_price <= tp:
                return True, f"take_profit hit @ {current_price}"

        return False, ""
