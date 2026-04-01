"""
Estrategias de Mean Reversion:

1. ZScoreMeanReversion — Z-score estático sobre rolling window
2. KalmanMeanReversion — Z-score adaptativo usando Kalman Filter

La lógica de fondo:
  El precio se desvía de su media → apostamos a que vuelve.
  La clave es que el activo sea mean-reverting (Hurst < 0.5).
  Por eso el Hurst se puede usar como filtro de régimen.
"""
from strategies.base import Strategy, Signal
from indicators.technical import atr
from indicators.math_utils import zscore, KalmanFilter, hurst_exponent


class ZScoreMeanReversion(Strategy):
    name = "MeanRev_Z"

    def __init__(
        self,
        period: int = 20,
        entry_z: float = 2.0,
        exit_z: float = 0.5,
        atr_period: int = 14,
        sl_atr_mult: float = 2.0,
        tp_atr_mult: float = 2.0,
        use_hurst_filter: bool = True,
        hurst_threshold: float = 0.5,
    ):
        self.params = {
            "period": period,
            "entry_z": entry_z,
            "exit_z": exit_z,
            "atr_period": atr_period,
            "sl_atr_mult": sl_atr_mult,
            "tp_atr_mult": tp_atr_mult,
            "use_hurst_filter": use_hurst_filter,
            "hurst_threshold": hurst_threshold,
        }
        self.period = period
        self.entry_z = entry_z
        self.exit_z = exit_z
        self.atr_period = atr_period
        self.sl_atr_mult = sl_atr_mult
        self.tp_atr_mult = tp_atr_mult
        self.use_hurst_filter = use_hurst_filter
        self.hurst_threshold = hurst_threshold

    def analyze(self, symbol: str, candles: list[dict], orderbook=None) -> Signal | None:
        if len(candles) < max(self.period, self.atr_period, 100) + 5:
            return None

        # Filtro de régimen: solo operar si el activo es mean-reverting
        if self.use_hurst_filter:
            h = hurst_exponent(candles)
            if h is not None and h >= self.hurst_threshold:
                return None  # régimen trending, no mean-reverting

        z = zscore(candles, self.period)
        atr_val = atr(candles, self.atr_period)

        if z is None or atr_val is None:
            return None

        price = candles[-1]["close"]
        confidence = min(1.0, abs(z) / (self.entry_z * 2))

        # LONG: precio muy por debajo de la media
        if z <= -self.entry_z:
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="long",
                entry_price=price,
                confidence=round(confidence, 2),
                reason=f"Z={z:.2f} ≤ -{self.entry_z} (mean reversion long)",
                stop_loss=round(price - self.sl_atr_mult * atr_val, 4),
                take_profit=round(price + self.tp_atr_mult * atr_val, 4),
            )

        # SHORT: precio muy por encima de la media
        if z >= self.entry_z:
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="short",
                entry_price=price,
                confidence=round(confidence, 2),
                reason=f"Z={z:.2f} ≥ {self.entry_z} (mean reversion short)",
                stop_loss=round(price + self.sl_atr_mult * atr_val, 4),
                take_profit=round(price - self.tp_atr_mult * atr_val, 4),
            )

        return None

    def should_exit(self, position: dict, candles: list[dict], orderbook=None):
        """Cierre anticipado si el Z-score vuelve al centro."""
        base_exit, base_reason = super().should_exit(position, candles, orderbook)
        if base_exit:
            return base_exit, base_reason

        z = zscore(candles, self.period)
        if z is None:
            return False, ""

        side = position["side"]
        if side == "long" and z >= -self.exit_z:
            return True, f"Z mean-reversion complete: Z={z:.2f}"
        if side == "short" and z <= self.exit_z:
            return True, f"Z mean-reversion complete: Z={z:.2f}"

        return False, ""


class KalmanMeanReversion(Strategy):
    """
    Mean reversion usando Kalman Filter.
    El filtro estima el "precio justo" y entramos cuando el precio
    se desvía significativamente de esa estimación.
    """
    name = "KalmanMR"

    def __init__(
        self,
        process_noise: float = 1e-3,
        observation_noise: float = 0.1,
        deviation_threshold: float = 0.005,  # 0.5% de desviación
        atr_period: int = 14,
        sl_atr_mult: float = 2.0,
        tp_atr_mult: float = 2.0,
    ):
        self.params = {
            "process_noise": process_noise,
            "observation_noise": observation_noise,
            "deviation_threshold": deviation_threshold,
            "atr_period": atr_period,
            "sl_atr_mult": sl_atr_mult,
            "tp_atr_mult": tp_atr_mult,
        }
        self.process_noise = process_noise
        self.observation_noise = observation_noise
        self.deviation_threshold = deviation_threshold
        self.atr_period = atr_period
        self.sl_atr_mult = sl_atr_mult
        self.tp_atr_mult = tp_atr_mult
        # Un filtro por símbolo
        self._filters: dict[str, KalmanFilter] = {}

    def _get_filter(self, symbol: str) -> KalmanFilter:
        if symbol not in self._filters:
            self._filters[symbol] = KalmanFilter(self.process_noise, self.observation_noise)
        return self._filters[symbol]

    def analyze(self, symbol: str, candles: list[dict], orderbook=None) -> Signal | None:
        if len(candles) < self.atr_period + 5:
            return None

        kf = self._get_filter(symbol)
        price = candles[-1]["close"]
        estimated = kf.update(price)

        # Actualizar con velas anteriores si el filtro es nuevo
        if len(candles) > 50 and kf.x == price:
            for c in candles[-50:-1]:
                kf.update(c["close"])
            estimated = kf.update(price)

        atr_val = atr(candles, self.atr_period)
        if atr_val is None:
            return None

        deviation_pct = (price - estimated) / estimated if estimated > 0 else 0
        confidence = min(1.0, abs(deviation_pct) / (self.deviation_threshold * 3))

        # LONG: precio bajo la estimación Kalman
        if deviation_pct <= -self.deviation_threshold:
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="long",
                entry_price=price,
                confidence=round(confidence, 2),
                reason=f"Kalman dev={deviation_pct*100:.2f}% | estimated={estimated:.2f}",
                stop_loss=round(price - self.sl_atr_mult * atr_val, 4),
                take_profit=round(estimated, 4),
            )

        # SHORT: precio sobre la estimación Kalman
        if deviation_pct >= self.deviation_threshold:
            return Signal(
                strategy_name=self.name,
                symbol=symbol,
                side="short",
                entry_price=price,
                confidence=round(confidence, 2),
                reason=f"Kalman dev={deviation_pct*100:.2f}% | estimated={estimated:.2f}",
                stop_loss=round(price + self.sl_atr_mult * atr_val, 4),
                take_profit=round(estimated, 4),
            )

        return None
