"""
Strategy Engine — orquesta estrategias candle-based Y tick-based.

Candle-based: RSI, MeanRev_Z, KalmanMR, OFlow_CVD, OFlow_OBI
  → se evalúan al cerrar cada vela de 1 minuto

Tick-based: MarketMaker
  → se evalúa en cada aggTrade (decenas por segundo)
"""
from collections import deque
from datetime import datetime

from strategies.base import Strategy, Signal
from strategies.rsi import RSIStrategy
from strategies.mean_reversion import ZScoreMeanReversion, KalmanMeanReversion
from strategies.order_flow_strategy import CVDDivergenceStrategy, OBImbalanceStrategy
from strategies.market_maker import MarketMakerStrategy
from paper_trader import PaperTrader
from database import upsert_strategy, save_trade, save_equity_snapshot
from config import CANDLE_BUFFER_SIZE, SYMBOLS
import uuid
from datetime import datetime


class StrategyEngine:
    def __init__(self, paper_trader: PaperTrader):
        self.trader = paper_trader

        self._candles:    dict[str, deque] = {s: deque(maxlen=CANDLE_BUFFER_SIZE) for s in SYMBOLS}
        self._orderbooks: dict[str, dict]  = {}

        self._on_signal_callbacks: list = []
        self._on_trade_callbacks:  list = []

        self.strategies: list[Strategy] = self._build_strategies()
        self._register_strategies()

        # Separar tick-based de candle-based
        self._tick_strategies   = [s for s in self.strategies if s.tick_based]
        self._candle_strategies = [s for s in self.strategies if not s.tick_based]

    def _build_strategies(self) -> list[Strategy]:
        return [
            RSIStrategy(rsi_period=14, oversold=30, overbought=70),
            ZScoreMeanReversion(period=20, entry_z=2.0),
            KalmanMeanReversion(process_noise=1e-3, observation_noise=0.1),
            CVDDivergenceStrategy(cvd_period=10),
            OBImbalanceStrategy(imbalance_threshold=0.4),
            MarketMakerStrategy(
                base_spread_bps=4.0,
                quote_size_usdt=150.0,
                max_inventory_usdt=600.0,
                gamma=0.1,
                kappa=1.5,
            ),
        ]

    def _register_strategies(self):
        for strat in self.strategies:
            upsert_strategy(strat.name, strat.params, enabled=True)

    # ── Callbacks ─────────────────────────────────────────────────────────────

    def on_signal(self, cb):
        self._on_signal_callbacks.append(cb)

    def on_trade(self, cb):
        self._on_trade_callbacks.append(cb)

    def _notify_signal(self, signal: Signal):
        for cb in self._on_signal_callbacks:
            cb(signal)

    def _notify_trade(self, trade: dict):
        for cb in self._on_trade_callbacks:
            cb(trade)

    # ── Data updates ──────────────────────────────────────────────────────────

    def update_candle(self, symbol: str, candle: dict):
        buf = self._candles[symbol]
        if buf and buf[-1]["timestamp"] != candle["timestamp"]:
            self._on_candle_close(symbol)
        if buf and buf[-1]["timestamp"] == candle["timestamp"]:
            buf[-1] = candle
        else:
            buf.append(candle)

    def update_tick(self, tick: dict):
        """
        Llamado en cada aggTrade. Solo las estrategias tick_based lo procesan.
        """
        symbol = tick.get("symbol", "")
        # Mapear 'BTCUSDT' → 'BTC/USDT:USDT'
        full_symbol = self._ws_symbol_to_ccxt(symbol)
        if not full_symbol:
            return

        candles   = list(self._candles.get(full_symbol, []))
        orderbook = self._orderbooks.get(full_symbol)

        for strat in self._tick_strategies:
            if getattr(strat, "_enabled", True) is False:
                continue
            events = strat.on_tick(full_symbol, tick, candles, orderbook)
            for event in events:
                self._handle_mm_event(event, full_symbol)

    def update_orderbook(self, symbol: str, orderbook: dict):
        self._orderbooks[symbol] = orderbook

    def load_historical(self, symbol: str, candles: list[dict]):
        buf = self._candles[symbol]
        buf.clear()
        for c in candles[-CANDLE_BUFFER_SIZE:]:
            buf.append(c)
        print(f"[INIT] {symbol}: {len(buf)} velas cargadas")

    # ── Candle close ──────────────────────────────────────────────────────────

    def _on_candle_close(self, symbol: str):
        candles   = list(self._candles[symbol])
        orderbook = self._orderbooks.get(symbol)

        # Actualizar tick-based strategies con datos de vela (para σ y CVD)
        for strat in self._tick_strategies:
            strat.analyze(symbol, candles, orderbook)

        # Verificar cierres de posiciones candle-based
        for pos in self.trader.get_open_positions():
            if pos["symbol"] != symbol or pos["strategy_name"] == "MarketMaker":
                continue
            strat = self._find_strategy(pos["strategy_name"])
            if strat is None:
                continue
            should_close, reason = strat.should_exit(pos, candles, orderbook)
            if should_close:
                trade = self.trader.close_position(pos["id"], candles[-1]["close"], reason)
                if trade:
                    self._notify_trade(trade)

        # Evaluar señales de estrategias candle-based
        for strat in self._candle_strategies:
            if getattr(strat, "_enabled", True) is False:
                continue
            signal = strat.analyze(symbol, candles, orderbook)
            if signal:
                self._notify_signal(signal)
                self.trader.open_position(signal, kelly_prior=strat.kelly_prior)

    # ── MM event handler ──────────────────────────────────────────────────────

    def _handle_mm_event(self, event: dict, symbol: str):
        """Procesa open/close del market maker y notifica via callbacks."""
        if event["type"] == "open":
            self.trader.open_mm_position(event)

        elif event["type"] == "close":
            trade = self.trader.close_mm_position(event)
            if trade:
                self._notify_trade(trade)

    # ── Utilities ─────────────────────────────────────────────────────────────

    @staticmethod
    def _ws_symbol_to_ccxt(ws_symbol: str) -> str | None:
        """'BTCUSDT' → 'BTC/USDT:USDT'"""
        mapping = {
            "BTCUSDT": "BTC/USDT:USDT",
            "ETHUSDT": "ETH/USDT:USDT",
            "SOLUSDT": "SOL/USDT:USDT",
            "BNBUSDT": "BNB/USDT:USDT",
        }
        return mapping.get(ws_symbol.upper())

    def _find_strategy(self, name: str) -> Strategy | None:
        for s in self.strategies:
            if s.name == name:
                return s
        return None

    def get_candles(self, symbol: str) -> list[dict]:
        return list(self._candles.get(symbol, []))

    def get_current_prices(self) -> dict[str, float]:
        return {sym: buf[-1]["close"] for sym, buf in self._candles.items() if buf}

    def get_mm_state(self) -> list[dict]:
        """Estado del market maker para el dashboard."""
        result = []
        for strat in self._tick_strategies:
            if isinstance(strat, MarketMakerStrategy):
                for symbol in SYMBOLS:
                    inv    = strat.get_inventory(symbol)
                    quotes = strat.get_quotes(symbol)
                    result.append({**inv, "quotes": quotes})
        return result
