"""
High-Speed Market Maker — Modelo Avellaneda-Stoikov

Opera en cada tick (aggTrade), no en velas cerradas.

─── Modelo teórico ────────────────────────────────────────────────────────────

El MM gana el spread entre bid y ask. El riesgo es el "inventory risk":
si el mercado se mueve en contra antes de que completemos el round-trip,
perdemos más que el spread que ganamos.

A-S formula:
  reservation_price  r = mid - q·γ·σ²·Δt
  optimal_spread     δ = γ·σ²·Δt + (2/γ)·ln(1 + γ/κ)
  our_bid            = r - δ/2
  our_ask            = r + δ/2

donde:
  q    = inventario actual (unidades, positivo=long, negativo=short)
  γ    = risk_aversion (0.05–0.5): más alto → spreads más anchos
  σ    = volatilidad realizada (std log-returns anualizado, en % del precio)
  κ    = profundidad del mercado (1.0–3.0): más alto → spreads más estrechos
  Δt   = horizonte (usamos 1/1440 del día → 1 minuto normalizado)

─── Fill simulation ───────────────────────────────────────────────────────────

Como paper trader, simulamos fills cuando el precio cruza nuestra cotización:
  - Bid fill: tick.price ≤ our_bid  (alguien vendió y nos golpeó)
  - Ask fill: tick.price ≥ our_ask  (alguien compró y nos golpeó)

─── Adverse selection filter ──────────────────────────────────────────────────

Si el CVD reciente es fuertemente direccional (un lado domina), estamos
expuestos a adverse selection (los informed traders nos van a golpear).
En ese caso, desplazamos las cotizaciones o paramos temporalmente.

─── Circuit breaker ───────────────────────────────────────────────────────────

Si el inventario supera max_inventory_usdt, dejamos de cotizar hasta que
el inventario vuelva a un nivel aceptable.
"""
import math
import uuid
import numpy as np
from datetime import datetime
from strategies.base import Strategy, Signal
from indicators.math_utils import realized_volatility


class MarketMakerStrategy(Strategy):
    name       = "MarketMaker"
    tick_based = True

    # Kelly prior no aplica a MM (sizing basado en inventario, no Kelly)
    kelly_prior = {"win_rate": 0.55, "rr": 1.0}

    def __init__(
        self,
        base_spread_bps:       float = 4.0,    # spread mínimo en basis points
        quote_size_usdt:       float = 150.0,  # tamaño de cada cotización en $
        max_inventory_usdt:    float = 600.0,  # inventario máximo por lado
        gamma:                 float = 0.1,    # risk aversion A-S
        kappa:                 float = 1.5,    # market depth A-S
        vol_window:            int   = 20,     # velas para calcular σ
        adverse_cvd_threshold: float = 0.35,   # si |CVD_ratio| > esto → pausa
        min_spread_bps:        float = 2.0,    # spread mínimo absoluto (bps)
        max_spread_bps:        float = 30.0,   # spread máximo (no más ancho)
    ):
        self.base_spread_bps       = base_spread_bps
        self.quote_size_usdt       = quote_size_usdt
        self.max_inventory_usdt    = max_inventory_usdt
        self.gamma                 = gamma
        self.kappa                 = kappa
        self.vol_window            = vol_window
        self.adverse_cvd_threshold = adverse_cvd_threshold
        self.min_spread_bps        = min_spread_bps
        self.max_spread_bps        = max_spread_bps

        self.params = {
            "base_spread_bps":       base_spread_bps,
            "quote_size_usdt":       quote_size_usdt,
            "max_inventory_usdt":    max_inventory_usdt,
            "gamma":                 gamma,
            "kappa":                 kappa,
            "vol_window":            vol_window,
            "adverse_cvd_threshold": adverse_cvd_threshold,
        }

        # Estado por símbolo
        self._inventory:    dict[str, float] = {}   # USDT value, signed
        self._avg_entry:    dict[str, float] = {}   # average entry price
        self._quotes:       dict[str, dict]  = {}   # {bid, ask, size}
        self._cvd_buffer:   dict[str, list]  = {}   # recent candle deltas
        self._sigma_cache:  dict[str, float] = {}   # cached σ per symbol
        self._paused_until: dict[str, float] = {}   # unix ts
        self._completed_trades: list[dict]   = []   # buffer de trades completados

    # ── Candle-based interface (obligatorio por ABC) ──────────────────────────

    def analyze(self, symbol: str, candles: list[dict], orderbook=None) -> Signal | None:
        """Actualiza σ y CVD buffer en cada vela cerrada. No genera señales candle."""
        self._sigma_cache[symbol]  = realized_volatility(candles, self.vol_window)
        self._cvd_buffer[symbol]   = candles[-20:] if len(candles) >= 20 else candles[:]
        return None

    # ── Tick-based interface ──────────────────────────────────────────────────

    def on_tick(
        self,
        symbol:    str,
        tick:      dict,
        candles:   list[dict],
        orderbook: dict | None = None,
    ) -> list[dict]:
        """
        Llamado en cada aggTrade.
        Devuelve lista de eventos {type: 'open'|'close', ...} para el engine.
        """
        import time
        now = time.time()

        # ── Circuit breaker: inventario excesivo ──────────────────────────────
        inv = self._inventory.get(symbol, 0.0)
        if abs(inv) >= self.max_inventory_usdt:
            self._paused_until[symbol] = now + 30.0   # pausa 30s
            return []

        # ── Pausa activa ──────────────────────────────────────────────────────
        if now < self._paused_until.get(symbol, 0):
            return []

        # ── Filtro adverse selection ──────────────────────────────────────────
        if self._is_adverse(symbol):
            return []

        # ── Calcular cotizaciones óptimas ─────────────────────────────────────
        mid = tick["price"]
        if mid <= 0:
            return []

        bid, ask = self._optimal_quotes(symbol, mid, inv)

        # ── Guardar cotizaciones actuales ─────────────────────────────────────
        self._quotes[symbol] = {"bid": bid, "ask": ask, "size": self.quote_size_usdt}

        # ── Detectar fills ────────────────────────────────────────────────────
        events = []
        price   = tick["price"]
        is_sell = tick.get("is_buyer_maker", False)  # True = alguien vendió agresivamente

        # Bid fill: market sell llegó a nuestro bid → compramos (long)
        if price <= bid and is_sell:
            events += self._handle_bid_fill(symbol, bid, now)

        # Ask fill: market buy llegó a nuestro ask → vendemos (short)
        elif price >= ask and not is_sell:
            events += self._handle_ask_fill(symbol, ask, now)

        return events

    # ── Optimal quotes (Avellaneda-Stoikov) ───────────────────────────────────

    def _optimal_quotes(self, symbol: str, mid: float, inventory_usdt: float) -> tuple[float, float]:
        sigma   = self._sigma_cache.get(symbol, 0.01)
        gamma   = self.gamma
        kappa   = self.kappa
        dt      = 1 / 1440.0   # 1 minuto como fracción del día

        # Inventario en unidades de la base (ej: BTC)
        q = inventory_usdt / mid if mid > 0 else 0.0

        # Reservation price (ajustado por inventory risk)
        r = mid - q * gamma * (sigma ** 2) * dt * mid

        # Optimal spread
        delta_as = gamma * (sigma ** 2) * dt * mid + (2 / gamma) * math.log(1 + gamma / kappa)

        # Clamp spread entre min y max
        spread_bps = max(
            self.min_spread_bps,
            min(self.max_spread_bps, delta_as / mid * 10_000)
        )
        half_spread = mid * spread_bps / 10_000 / 2

        bid = round(r - half_spread, 2)
        ask = round(r + half_spread, 2)

        return bid, ask

    # ── Fill handlers ─────────────────────────────────────────────────────────

    def _handle_bid_fill(self, symbol: str, fill_price: float, ts: float) -> list[dict]:
        """Alguien nos vendió → somos long."""
        inv     = self._inventory.get(symbol, 0.0)
        size    = self.quote_size_usdt
        avg     = self._avg_entry.get(symbol, fill_price)

        events = []

        if inv < 0:
            # Tenemos short → este fill lo reduce (o cierra)
            close_size = min(size, abs(inv))
            pnl = (avg - fill_price) / avg * close_size   # short se cierra al comprar más bajo
            events.append({
                "type":       "close",
                "symbol":     symbol,
                "side":       "short",
                "entry_price": avg,
                "exit_price":  fill_price,
                "size":        close_size,
                "pnl":         round(pnl, 4),
                "reason":      f"MM bid_fill close_short @ {fill_price:.2f}",
            })
            self._inventory[symbol] = inv + close_size
            if self._inventory[symbol] >= 0:
                self._avg_entry[symbol] = fill_price

        else:
            # Añadimos long
            new_inv = inv + size
            self._avg_entry[symbol] = (avg * inv + fill_price * size) / new_inv if inv > 0 else fill_price
            self._inventory[symbol] = new_inv
            events.append({
                "type":       "open",
                "symbol":     symbol,
                "side":       "long",
                "entry_price": fill_price,
                "size":        size,
                "reason":      f"MM bid_fill open_long @ {fill_price:.2f}",
            })

        return events

    def _handle_ask_fill(self, symbol: str, fill_price: float, ts: float) -> list[dict]:
        """Alguien nos compró → somos short."""
        inv     = self._inventory.get(symbol, 0.0)
        size    = self.quote_size_usdt
        avg     = self._avg_entry.get(symbol, fill_price)

        events = []

        if inv > 0:
            # Tenemos long → este fill lo reduce (cierre = spread ganado)
            close_size = min(size, inv)
            pnl = (fill_price - avg) / avg * close_size
            events.append({
                "type":       "close",
                "symbol":     symbol,
                "side":       "long",
                "entry_price": avg,
                "exit_price":  fill_price,
                "size":        close_size,
                "pnl":         round(pnl, 4),
                "reason":      f"MM ask_fill close_long @ {fill_price:.2f} | spread={fill_price-avg:.2f}",
            })
            self._inventory[symbol] = inv - close_size
            if self._inventory[symbol] <= 0:
                self._avg_entry[symbol] = fill_price

        else:
            # Añadimos short
            new_inv = inv - size
            self._avg_entry[symbol] = (avg * abs(inv) + fill_price * size) / abs(new_inv) if inv < 0 else fill_price
            self._inventory[symbol] = new_inv
            events.append({
                "type":       "open",
                "symbol":     symbol,
                "side":       "short",
                "entry_price": fill_price,
                "size":        size,
                "reason":      f"MM ask_fill open_short @ {fill_price:.2f}",
            })

        return events

    # ── Adverse selection filter ──────────────────────────────────────────────

    def _is_adverse(self, symbol: str) -> bool:
        """
        Detecta flow tóxico usando el CVD de las últimas N velas.
        Si el CVD ratio (|CVD| / total_volume) supera el threshold → es adverse.
        """
        candles = self._cvd_buffer.get(symbol, [])
        if len(candles) < 3:
            return False

        total_vol = sum(c["volume"] for c in candles)
        if total_vol == 0:
            return False

        # Delta aproximado (buy_vol - sell_vol) usando la forma de la vela
        net_delta = 0.0
        for c in candles:
            h, l, cl, v = c["high"], c["low"], c["close"], c["volume"]
            if h != l:
                buy_ratio = (cl - l) / (h - l)
                net_delta += v * (2 * buy_ratio - 1)

        cvd_ratio = abs(net_delta) / total_vol
        return cvd_ratio > self.adverse_cvd_threshold

    # ── Estado público ────────────────────────────────────────────────────────

    def get_quotes(self, symbol: str) -> dict:
        return self._quotes.get(symbol, {})

    def get_inventory(self, symbol: str) -> dict:
        inv = self._inventory.get(symbol, 0.0)
        avg = self._avg_entry.get(symbol, 0.0)
        return {
            "symbol":         symbol,
            "inventory_usdt": round(inv, 2),
            "avg_entry":      round(avg, 4),
            "side":           "long" if inv > 0 else "short" if inv < 0 else "flat",
        }
