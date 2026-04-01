"""
Order Flow Analysis:
- CVD (Cumulative Volume Delta): diferencia acumulada entre volumen comprador y vendedor
- Bid/Ask Imbalance: desequilibrio en el order book
- Large Order Detection: órdenes grandes que mueven el mercado
- Volume Profile: distribución del volumen por precio

El volumen de una vela se aproxima al método taker:
  buy_volume ≈ volume * (close - low) / (high - low)
  sell_volume ≈ volume * (high - close) / (high - low)
"""
import numpy as np


def candle_delta(candle: dict) -> float:
    """
    Aproxima el delta (buy_vol - sell_vol) de una vela usando su forma.
    Más preciso con datos de tick, pero esta aproximación es suficiente para 1m.
    """
    h, l, c, v = candle["high"], candle["low"], candle["close"], candle["volume"]
    if h == l:
        return 0.0
    buy_ratio = (c - l) / (h - l)
    sell_ratio = 1 - buy_ratio
    return float(v * buy_ratio - v * sell_ratio)


def cvd(candles: list[dict]) -> float:
    """Cumulative Volume Delta de todas las velas en el buffer."""
    return float(sum(candle_delta(c) for c in candles))


def cvd_series(candles: list[dict]) -> list[float]:
    """CVD acumulado como serie temporal (para detectar divergencias)."""
    cumulative = 0.0
    result = []
    for c in candles:
        cumulative += candle_delta(c)
        result.append(cumulative)
    return result


def cvd_divergence(candles: list[dict], period: int = 10) -> str | None:
    """
    Detecta divergencia precio vs CVD en los últimos N periodos.
    - 'bearish': precio sube pero CVD cae → debilidad compradora
    - 'bullish': precio cae pero CVD sube → acumulación oculta
    - None: sin divergencia clara
    """
    if len(candles) < period + 1:
        return None

    recent = candles[-period:]
    prices = [c["close"] for c in recent]
    deltas = cvd_series(recent)

    price_trend = prices[-1] - prices[0]
    cvd_trend = deltas[-1] - deltas[0]

    if price_trend > 0 and cvd_trend < 0:
        return "bearish"
    if price_trend < 0 and cvd_trend > 0:
        return "bullish"
    return None


def orderbook_imbalance(orderbook: dict, levels: int = 5) -> float:
    """
    Desequilibrio del order book en los primeros N niveles.
    Rango: -1 (dominan asks/vendedores) a +1 (dominan bids/compradores)
    """
    if not orderbook or not orderbook.get("bids") or not orderbook.get("asks"):
        return 0.0

    bid_vol = sum(size for _, size in orderbook["bids"][:levels])
    ask_vol = sum(size for _, size in orderbook["asks"][:levels])
    total = bid_vol + ask_vol

    if total == 0:
        return 0.0

    return float((bid_vol - ask_vol) / total)


def detect_large_orders(orderbook: dict, threshold_multiplier: float = 3.0) -> dict:
    """
    Detecta órdenes grandes (muros) en el order book.
    Un nivel es "grande" si su tamaño es N veces la media del resto.
    """
    result = {"large_bids": [], "large_asks": []}

    for side_key, result_key in [("bids", "large_bids"), ("asks", "large_asks")]:
        levels = orderbook.get(side_key, [])
        if len(levels) < 3:
            continue
        sizes = [s for _, s in levels]
        mean_size = np.mean(sizes)
        threshold = mean_size * threshold_multiplier
        for price, size in levels:
            if size >= threshold:
                result[result_key].append({"price": price, "size": size})

    return result


def volume_weighted_mid(orderbook: dict, levels: int = 5) -> float | None:
    """
    Mid price ponderado por volumen (más preciso que (bid+ask)/2).
    """
    if not orderbook or not orderbook.get("bids") or not orderbook.get("asks"):
        return None

    bid_price, bid_size = orderbook["bids"][0] if orderbook["bids"] else (0, 0)
    ask_price, ask_size = orderbook["asks"][0] if orderbook["asks"] else (0, 0)

    total = bid_size + ask_size
    if total == 0:
        return None

    return float((bid_price * ask_size + ask_price * bid_size) / total)
