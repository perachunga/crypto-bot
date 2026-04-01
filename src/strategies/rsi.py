"""
Estrategia RSI clásica con confirmación de volumen.

Lógica:
- LONG: RSI < oversold_level AND volumen actual > N*media → precio sobrevendido con volumen
- SHORT: RSI > overbought_level AND volumen actual > N*media → precio sobrecomprado con volumen
- Stop: 1.5 * ATR por debajo/encima del entry
- Target: 2.5 * ATR por encima/debajo del entry (R/R ~1.67)
"""
from strategies.base import Strategy, Signal
from indicators.technical import rsi, atr, volume_ratio


class RSIStrategy(Strategy):
    name = "RSI"

    def __init__(
        self,
        rsi_period: int = 14,
        oversold: float = 30,
        overbought: float = 70,
        volume_mult: float = 1.2,
        atr_period: int = 14,
        sl_atr_mult: float = 1.5,
        tp_atr_mult: float = 2.5,
    ):
        self.params = {
            "rsi_period": rsi_period,
            "oversold": oversold,
            "overbought": overbought,
            "volume_mult": volume_mult,
            "atr_period": atr_period,
            "sl_atr_mult": sl_atr_mult,
            "tp_atr_mult": tp_atr_mult,
        }
        self.rsi_period = rsi_period
        self.oversold = oversold
        self.overbought = overbought
        self.volume_mult = volume_mult
        self.atr_period = atr_period
        self.sl_atr_mult = sl_atr_mult
        self.tp_atr_mult = tp_atr_mult

    def analyze(self, symbol: str, candles: list[dict], orderbook=None) -> Signal | None:
        min_candles = max(self.rsi_period, self.atr_period) + 20
        if len(candles) < min_candles:
            return None

        rsi_val = rsi(candles, self.rsi_period)
        atr_val = atr(candles, self.atr_period)
        vol_ratio = volume_ratio(candles)

        if rsi_val is None or atr_val is None or vol_ratio is None:
            return None

        price = candles[-1]["close"]

        # LONG: RSI sobrevendido + volumen elevado
        if rsi_val < self.oversold and vol_ratio >= self.volume_mult:
            confidence = min(1.0, (self.oversold - rsi_val) / self.oversold * 2)
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="long",
                entry_price=price,
                confidence=round(confidence, 2),
                reason=f"RSI={rsi_val:.1f} < {self.oversold} | vol_ratio={vol_ratio:.2f}",
                stop_loss=round(price - self.sl_atr_mult * atr_val, 4),
                take_profit=round(price + self.tp_atr_mult * atr_val, 4),
            )

        # SHORT: RSI sobrecomprado + volumen elevado
        if rsi_val > self.overbought and vol_ratio >= self.volume_mult:
            confidence = min(1.0, (rsi_val - self.overbought) / (100 - self.overbought) * 2)
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="short",
                entry_price=price,
                confidence=round(confidence, 2),
                reason=f"RSI={rsi_val:.1f} > {self.overbought} | vol_ratio={vol_ratio:.2f}",
                stop_loss=round(price + self.sl_atr_mult * atr_val, 4),
                take_profit=round(price - self.tp_atr_mult * atr_val, 4),
            )

        return None
