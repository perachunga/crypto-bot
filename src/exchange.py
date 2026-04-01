"""
Datos de mercado desde Binance Futures producción.
Los endpoints públicos (OHLCV, order book) no requieren API key.
La autenticación solo se necesita para órdenes reales — nosotros usamos paper trader.
"""
import requests
from config import SYMBOLS

_BASE = "https://fapi.binance.com"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "CryptoBot/1.0"})


def _ccxt_to_binance(symbol: str) -> str:
    """'BTC/USDT:USDT' → 'BTCUSDT'"""
    base  = symbol.split("/")[0]
    quote = symbol.split("/")[1].split(":")[0]
    return f"{base}{quote}"


def fetch_ohlcv(symbol: str, limit: int = 300) -> list[dict]:
    """
    OHLCV desde Binance Futures producción (endpoint público, sin auth).
    Devuelve precios REALES de mercado.
    """
    binance_sym = _ccxt_to_binance(symbol)
    resp = _SESSION.get(
        f"{_BASE}/fapi/v1/klines",
        params={"symbol": binance_sym, "interval": "1m", "limit": limit},
        timeout=10,
    )
    resp.raise_for_status()
    candles = []
    for row in resp.json():
        candles.append({
            "timestamp": int(row[0]),
            "open":      float(row[1]),
            "high":      float(row[2]),
            "low":       float(row[3]),
            "close":     float(row[4]),
            "volume":    float(row[5]),
        })
    return candles


def fetch_orderbook(symbol: str, limit: int = 20) -> dict:
    """Order book desde Binance Futures producción (sin auth)."""
    binance_sym = _ccxt_to_binance(symbol)
    resp = _SESSION.get(
        f"{_BASE}/fapi/v1/depth",
        params={"symbol": binance_sym, "limit": limit},
        timeout=5,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "bids":      [[float(p), float(q)] for p, q in data["bids"]],
        "asks":      [[float(p), float(q)] for p, q in data["asks"]],
        "timestamp": data.get("T", 0),
    }
