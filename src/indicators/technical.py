"""
Indicadores técnicos usando la librería 'ta' (sin numba, compatible Python 3.14).
Reciben una lista de velas y devuelven el valor del indicador más reciente.
"""
import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange, BollingerBands
from ta.trend import EMAIndicator


def candles_to_df(candles: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(candles)
    df = df.rename(columns={"timestamp": "date"})
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)
    return df


def rsi(candles: list[dict], period: int = 14) -> float | None:
    if len(candles) < period + 1:
        return None
    df = candles_to_df(candles)
    result = RSIIndicator(close=df["close"], window=period).rsi()
    val = result.iloc[-1]
    return float(val) if not np.isnan(val) else None


def ema(candles: list[dict], period: int = 20) -> float | None:
    if len(candles) < period:
        return None
    df = candles_to_df(candles)
    result = EMAIndicator(close=df["close"], window=period).ema_indicator()
    val = result.iloc[-1]
    return float(val) if not np.isnan(val) else None


def bollinger_bands(candles: list[dict], period: int = 20, std: float = 2.0) -> dict | None:
    if len(candles) < period:
        return None
    df = candles_to_df(candles)
    bb = BollingerBands(close=df["close"], window=period, window_dev=std)
    upper = bb.bollinger_hband().iloc[-1]
    mid = bb.bollinger_mavg().iloc[-1]
    lower = bb.bollinger_lband().iloc[-1]
    if any(np.isnan(v) for v in [upper, mid, lower]):
        return None
    return {"upper": float(upper), "mid": float(mid), "lower": float(lower)}


def atr(candles: list[dict], period: int = 14) -> float | None:
    if len(candles) < period + 1:
        return None
    df = candles_to_df(candles)
    result = AverageTrueRange(
        high=df["high"], low=df["low"], close=df["close"], window=period
    ).average_true_range()
    val = result.iloc[-1]
    return float(val) if not np.isnan(val) else None


def volume_ratio(candles: list[dict], period: int = 20) -> float | None:
    """Volumen actual vs media de los últimos N periodos."""
    if len(candles) < period + 1:
        return None
    vols = [c["volume"] for c in candles]
    avg = np.mean(vols[-period - 1:-1])
    current = vols[-1]
    return float(current / avg) if avg > 0 else None
