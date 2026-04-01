"""
Data Feed — WebSocket Binance Futures producción.
Precios REALES tick-by-tick desde fstream.binance.com (sin API key).

Streams:
  @aggTrade  → tick-by-tick (cada trade)
  @kline_1m  → velas para estrategias
  @bookTicker → mejor bid/ask en tiempo real
"""
import asyncio
import json
import websockets
from exchange import fetch_ohlcv, fetch_orderbook
from config import SYMBOLS

WS_URL = "wss://fstream.binance.com/stream"


def _sym_to_stream(symbol: str) -> str:
    """'BTC/USDT:USDT' → 'btcusdt'"""
    base  = symbol.split("/")[0].lower()
    quote = symbol.split("/")[1].split(":")[0].lower()
    return f"{base}{quote}"


def _parse_kline(data: dict) -> dict | None:
    k = data.get("k")
    if not k:
        return None
    return {
        "timestamp": int(k["t"]),
        "open":      float(k["o"]),
        "high":      float(k["h"]),
        "low":       float(k["l"]),
        "close":     float(k["c"]),
        "volume":    float(k["v"]),
        "closed":    bool(k["x"]),
    }


class DataFeed:
    def __init__(self, engine):
        self.engine = engine
        self._running = False
        self._on_tick_callbacks: list = []
        self._on_book_callbacks: list = []

    def on_tick(self, cb):
        self._on_tick_callbacks.append(cb)

    def on_book(self, cb):
        self._on_book_callbacks.append(cb)

    async def start(self):
        self._running = True
        await self._load_historical()
        await asyncio.gather(
            self._stream_market_data(),
            self._poll_orderbooks(),
        )

    async def _load_historical(self):
        print("[DATA] Cargando OHLCV desde Binance producción...")
        loop = asyncio.get_event_loop()
        for symbol in SYMBOLS:
            try:
                candles = await loop.run_in_executor(None, fetch_ohlcv, symbol, 300)
                self.engine.load_historical(symbol, candles)
                print(f"[INIT] {symbol}: {len(candles)} velas | último close={candles[-1]['close']}")
            except Exception as e:
                print(f"[DATA] Error {symbol}: {e}")
        print("[DATA] Histórico listo — conectando WebSocket...")

    async def _stream_market_data(self):
        """
        WebSocket combinado: aggTrade + kline_1m + bookTicker para todos los símbolos.
        """
        streams = []
        for s in SYMBOLS:
            sym = _sym_to_stream(s)
            streams.append(f"{sym}@aggTrade")
            streams.append(f"{sym}@kline_1m")
            streams.append(f"{sym}@bookTicker")

        url = f"{WS_URL}?streams={'/'.join(streams)}"

        while self._running:
            try:
                print(f"[WS] Conectando producción: {url[:80]}...")
                async with websockets.connect(
                    url, ping_interval=20, max_size=2**20,
                    open_timeout=15,
                ) as ws:
                    print("[WS] ✓ Conectado — recibiendo datos reales")
                    async for raw in ws:
                        if not self._running:
                            break
                        msg    = json.loads(raw)
                        data   = msg.get("data", msg)
                        stream = msg.get("stream", "")
                        event  = data.get("e", "")

                        # ── aggTrade → tick-by-tick ────────────────────────
                        if event == "aggTrade":
                            tick = {
                                "symbol":         data["s"],
                                "price":          float(data["p"]),
                                "qty":            float(data["q"]),
                                "is_buyer_maker": bool(data["m"]),
                                "timestamp":      int(data["T"]),
                            }
                            # Broadcast al dashboard
                            for cb in self._on_tick_callbacks:
                                cb(tick)
                            # Routing al engine (market maker)
                            self.engine.update_tick(tick)

                        # ── bookTicker → bid/ask ───────────────────────────
                        elif event == "bookTicker" or ("b" in data and "a" in data and "s" in data):
                            book = {
                                "symbol": data.get("s", ""),
                                "bid":    float(data.get("b", 0)),
                                "ask":    float(data.get("a", 0)),
                            }
                            if book["bid"] > 0:
                                for cb in self._on_book_callbacks:
                                    cb(book)

                        # ── kline → estrategias ────────────────────────────
                        elif event == "kline":
                            candle = _parse_kline(data)
                            if candle:
                                for symbol in SYMBOLS:
                                    if _sym_to_stream(symbol) in stream:
                                        self.engine.update_candle(symbol, candle)
                                        break

            except Exception as e:
                print(f"[WS] Error: {e} — reconectando en 5s...")
                await asyncio.sleep(5)

    async def _poll_orderbooks(self):
        """Order book cada 2s para estrategias de order flow."""
        loop = asyncio.get_event_loop()
        while self._running:
            for symbol in SYMBOLS:
                try:
                    ob = await loop.run_in_executor(None, fetch_orderbook, symbol, 20)
                    self.engine.update_orderbook(symbol, ob)
                except Exception as e:
                    print(f"[OB] {symbol}: {e}")
            await asyncio.sleep(2)

    def stop(self):
        self._running = False
