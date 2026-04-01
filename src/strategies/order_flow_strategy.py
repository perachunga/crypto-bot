"""
Estrategia basada en Order Flow:
- CVD Divergence: el precio va en una dirección pero el volumen dice lo contrario
- Order Book Imbalance: desequilibrio bids vs asks como señal de presión

Estas estrategias son más "institucionales" — detectan lo que el mercado
está haciendo realmente vs lo que parece en el precio.
"""
from strategies.base import Strategy, Signal
from indicators.technical import atr, ema
from indicators.order_flow import (
    cvd_divergence, orderbook_imbalance, volume_weighted_mid, cvd_series
)


class CVDDivergenceStrategy(Strategy):
    """
    Detecta divergencias entre precio y CVD.
    - Bearish divergence: precio sube pero compradores se retiran → short
    - Bullish divergence: precio cae pero compradores acumulan → long
    """
    name = "OFlow_CVD"

    def __init__(
        self,
        cvd_period: int = 10,
        atr_period: int = 14,
        sl_atr_mult: float = 1.5,
        tp_atr_mult: float = 2.5,
        min_imbalance: float = 0.1,  # imbalance mínimo del OB para confirmar
    ):
        self.params = {
            "cvd_period": cvd_period,
            "atr_period": atr_period,
            "sl_atr_mult": sl_atr_mult,
            "tp_atr_mult": tp_atr_mult,
            "min_imbalance": min_imbalance,
        }
        self.cvd_period = cvd_period
        self.atr_period = atr_period
        self.sl_atr_mult = sl_atr_mult
        self.tp_atr_mult = tp_atr_mult
        self.min_imbalance = min_imbalance

    def analyze(self, symbol: str, candles: list[dict], orderbook=None) -> Signal | None:
        if len(candles) < self.cvd_period + self.atr_period:
            return None

        divergence = cvd_divergence(candles, self.cvd_period)
        if divergence is None:
            return None

        atr_val = atr(candles, self.atr_period)
        if atr_val is None:
            return None

        price = candles[-1]["close"]
        imbalance = orderbook_imbalance(orderbook) if orderbook else 0.0

        # Bearish divergence: precio sube pero CVD cae → SHORT
        # Confirmamos con order book dominado por asks (imbalance < 0)
        if divergence == "bearish" and imbalance <= -self.min_imbalance:
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="short",
                entry_price=price,
                confidence=round(min(1.0, abs(imbalance) * 2), 2),
                reason=f"CVD bearish divergence | OB imbalance={imbalance:.2f}",
                stop_loss=round(price + self.sl_atr_mult * atr_val, 4),
                take_profit=round(price - self.tp_atr_mult * atr_val, 4),
            )

        # Bullish divergence: precio cae pero CVD sube → LONG
        # Confirmamos con order book dominado por bids (imbalance > 0)
        if divergence == "bullish" and imbalance >= self.min_imbalance:
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="long",
                entry_price=price,
                confidence=round(min(1.0, abs(imbalance) * 2), 2),
                reason=f"CVD bullish divergence | OB imbalance={imbalance:.2f}",
                stop_loss=round(price - self.sl_atr_mult * atr_val, 4),
                take_profit=round(price + self.tp_atr_mult * atr_val, 4),
            )

        return None


class OBImbalanceStrategy(Strategy):
    """
    Opera basándose solo en el desequilibrio del order book cuando es extremo.
    Un desequilibrio extremo indica que los market makers esperan un movimiento.
    """
    name = "OFlow_OBI"

    def __init__(
        self,
        imbalance_threshold: float = 0.4,  # 40% de desequilibrio
        levels: int = 10,
        atr_period: int = 14,
        sl_atr_mult: float = 1.0,
        tp_atr_mult: float = 1.5,
        ema_period: int = 20,
    ):
        self.params = {
            "imbalance_threshold": imbalance_threshold,
            "levels": levels,
            "atr_period": atr_period,
            "sl_atr_mult": sl_atr_mult,
            "tp_atr_mult": tp_atr_mult,
            "ema_period": ema_period,
        }
        self.imbalance_threshold = imbalance_threshold
        self.levels = levels
        self.atr_period = atr_period
        self.sl_atr_mult = sl_atr_mult
        self.tp_atr_mult = tp_atr_mult
        self.ema_period = ema_period

    def analyze(self, symbol: str, candles: list[dict], orderbook=None) -> Signal | None:
        if orderbook is None or len(candles) < self.atr_period + self.ema_period:
            return None

        imbalance = orderbook_imbalance(orderbook, self.levels)
        atr_val = atr(candles, self.atr_period)
        ema_val = ema(candles, self.ema_period)

        if atr_val is None or ema_val is None:
            return None

        price = candles[-1]["close"]

        # Solo operar en dirección de la tendencia (EMA filter)
        trend = "up" if price > ema_val else "down"

        # Presión compradora fuerte + tendencia alcista → LONG
        if imbalance >= self.imbalance_threshold and trend == "up":
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="long",
                entry_price=price,
                confidence=round(min(1.0, imbalance), 2),
                reason=f"OB imbalance={imbalance:.2f} | trend=up | EMA={ema_val:.2f}",
                stop_loss=round(price - self.sl_atr_mult * atr_val, 4),
                take_profit=round(price + self.tp_atr_mult * atr_val, 4),
            )

        # Presión vendedora fuerte + tendencia bajista → SHORT
        if imbalance <= -self.imbalance_threshold and trend == "down":
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="short",
                entry_price=price,
                confidence=round(min(1.0, abs(imbalance)), 2),
                reason=f"OB imbalance={imbalance:.2f} | trend=down | EMA={ema_val:.2f}",
                stop_loss=round(price + self.sl_atr_mult * atr_val, 4),
                take_profit=round(price - self.tp_atr_mult * atr_val, 4),
            )

        return None
