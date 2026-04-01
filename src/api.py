"""
FastAPI backend.

REST:
  GET  /summary
  GET  /metrics           → todas las estrategias
  GET  /metrics/{name}
  GET  /trades
  GET  /positions
  GET  /equity
  GET  /equity/{name}
  GET  /strategies        → configuración + métricas de cada estrategia
  POST /strategies/{name}/reset  → reset portfolio
  GET  /candles/{symbol}
  GET  /hurst/{symbol}

WebSocket /ws:
  type: "tick"    → precio tick-by-tick
  type: "book"    → bid/ask
  type: "signal"  → nueva señal de estrategia
  type: "trade"   → trade cerrado
  type: "prices"  → snapshot de precios + uPnL cada segundo
"""
import json
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from database import (
    init_db, get_trades, get_positions, get_equity_snapshots,
    get_all_metrics, get_strategy_metrics, get_strategy_configs,
    upsert_strategy,
)
from paper_trader import PaperTrader
from strategy_engine import StrategyEngine
from data_feed import DataFeed
from indicators.math_utils import hurst_exponent
from config import SYMBOLS, INITIAL_CAPITAL

trader: PaperTrader    | None = None
engine: StrategyEngine | None = None
feed:   DataFeed       | None = None
ws_clients: list[WebSocket] = []

# Cache de últimos precios tick-by-tick (para la respuesta REST)
_last_prices: dict[str, float] = {}
_last_book:   dict[str, dict]  = {}

# Mapping WS symbol → CCXT symbol (para que _last_prices coincida con posiciones)
_WS_TO_CCXT = {
    "BTCUSDT": "BTC/USDT:USDT",
    "ETHUSDT": "ETH/USDT:USDT",
    "SOLUSDT": "SOL/USDT:USDT",
    "BNBUSDT": "BNB/USDT:USDT",
}


async def broadcast(event_type: str, data: dict):
    msg  = json.dumps({"type": event_type, "data": data}, default=str)
    dead = []
    for ws in ws_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in ws_clients:
            ws_clients.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global trader, engine, feed

    init_db()
    from migrate_once import migrate_once
    migrate_once()
    trader = PaperTrader()
    engine = StrategyEngine(trader)
    feed   = DataFeed(engine)

    # ── Callbacks de estrategias → WS broadcast ──────────────────────────────
    def on_signal(signal):
        asyncio.create_task(broadcast("signal", {
            "strategy":   signal.strategy_name,
            "symbol":     signal.symbol,
            "side":       signal.side,
            "price":      signal.entry_price,
            "confidence": signal.confidence,
            "reason":     signal.reason,
        }))

    def on_trade(trade):
        asyncio.create_task(broadcast("trade", trade))

    engine.on_signal(on_signal)
    engine.on_trade(on_trade)

    # ── Callbacks de ticks → WS broadcast ────────────────────────────────────
    def on_tick(tick: dict):
        sym = tick["symbol"]
        ccxt_sym = _WS_TO_CCXT.get(sym.upper(), sym)
        _last_prices[ccxt_sym] = tick["price"]
        asyncio.create_task(broadcast("tick", tick))

    def on_book(book: dict):
        sym = book["symbol"]
        _last_book[sym] = book
        asyncio.create_task(broadcast("book", book))

    feed.on_tick(on_tick)
    feed.on_book(on_book)

    # ── Precio snapshot cada segundo (para uPnL) ──────────────────────────────
    async def price_loop():
        while True:
            prices  = {**_last_prices}
            upnl    = trader.get_unrealized_pnl(prices)
            if prices:
                await broadcast("prices", {"prices": prices, "unrealized_pnl": upnl})
            await asyncio.sleep(1)

    asyncio.create_task(price_loop())
    asyncio.create_task(feed.start())

    yield
    feed.stop()


app = FastAPI(title="Crypto Bot API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

router = APIRouter(prefix="/api")


# ── REST ──────────────────────────────────────────────────────────────────────

def _ts(v):
    return v.isoformat() if isinstance(v, datetime) else v


@router.get("/summary")
def summary():
    if trader is None:
        return {}
    prices      = {**_last_prices}
    upnl        = trader.get_unrealized_pnl(prices)
    equity_map  = trader.get_equity_summary()
    all_metrics = get_all_metrics()
    total_trades = sum(m["trades"] for m in all_metrics)
    total_pnl    = sum(m["total_pnl"] for m in all_metrics)
    avg_wr       = (sum(m["win_rate"] for m in all_metrics) / len(all_metrics)) if all_metrics else 0
    return {
        "total_equity":         round(sum(equity_map.values()), 2),
        "total_unrealized_pnl": round(sum(upnl.values()), 2),
        "total_realized_pnl":   round(total_pnl, 2),
        "total_trades":         total_trades,
        "avg_win_rate":         round(avg_wr, 1),
        "open_positions":       len(trader.get_open_positions()),
        "equity_by_strategy":   equity_map,
    }


@router.get("/metrics")
def metrics():
    return get_all_metrics()


@router.get("/metrics/{strategy_name}")
def metrics_one(strategy_name: str):
    return get_strategy_metrics(strategy_name)


@router.get("/trades")
def trades(strategy: str | None = None, limit: int = 200):
    return [{**t, "opened_at": _ts(t["opened_at"]), "closed_at": _ts(t["closed_at"])}
            for t in get_trades(strategy_name=strategy, limit=limit)]


@router.get("/positions")
def positions():
    prices = {**_last_prices}
    upnl   = trader.get_unrealized_pnl(prices) if trader else {}
    result = []
    for pos in get_positions():
        price = prices.get(pos["symbol"])
        result.append({
            **pos,
            "current_price":   price,
            "unrealized_pnl":  upnl.get(pos["id"], 0),
            "opened_at":       _ts(pos["opened_at"]),
        })
    return result


@router.get("/equity")
def equity_all(limit: int = 500):
    return [{**s, "timestamp": _ts(s["timestamp"])} for s in get_equity_snapshots(limit=limit)]


@router.get("/equity/{strategy_name}")
def equity_one(strategy_name: str, limit: int = 500):
    return [{**s, "timestamp": _ts(s["timestamp"])}
            for s in get_equity_snapshots(strategy_name=strategy_name, limit=limit)]


@router.get("/strategies")
def strategies_list():
    """Retorna configuración + métricas de cada estrategia registrada."""
    configs  = {c["name"]: c for c in get_strategy_configs()}
    metrics  = {m["strategy"]: m for m in get_all_metrics()}
    equity_m = trader.get_equity_summary() if trader else {}

    result = []
    if engine:
        for strat in engine.strategies:
            name    = strat.name
            cfg     = configs.get(name, {})
            met     = metrics.get(name, {"trades": 0, "win_rate": 0, "total_pnl": 0,
                                         "sharpe": 0, "max_drawdown": 0, "avg_win": 0, "avg_loss": 0})
            capital = equity_m.get(name, INITIAL_CAPITAL)
            result.append({
                "name":         name,
                "enabled":      cfg.get("enabled", True),
                "params":       strat.params,
                "metrics":      met,
                "capital":      round(capital, 2),
                "initial":      INITIAL_CAPITAL,
                "return_pct":   round((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100, 2),
            })
    return result


@router.post("/strategies/{strategy_name}/reset")
def reset_strategy(strategy_name: str):
    """Cierra posiciones abiertas y resetea el capital de la estrategia."""
    if trader is None or engine is None:
        return {"error": "bot not running"}
    prices = {**_last_prices}
    # Completar precios faltantes con último cierre de vela
    for sym in SYMBOLS:
        if sym not in prices:
            candles = engine.get_candles(sym)
            if candles:
                prices[sym] = candles[-1]["close"]
    result = trader.reset_strategy(strategy_name, prices)
    asyncio.create_task(broadcast("reset", result))
    return result


@router.patch("/strategies/{strategy_name}/toggle")
def toggle_strategy(strategy_name: str):
    """Activa o desactiva una estrategia."""
    if engine is None:
        return {"error": "bot not running"}
    for strat in engine.strategies:
        if strat.name == strategy_name:
            current = getattr(strat, "_enabled", True)
            strat._enabled = not current
            upsert_strategy(strategy_name, strat.params, enabled=strat._enabled)
            return {"name": strategy_name, "enabled": strat._enabled}
    return {"error": "strategy not found"}


@router.get("/mm")
def mm_state():
    """Estado del market maker: inventario y cotizaciones por símbolo."""
    if engine is None:
        return []
    return engine.get_mm_state()


@router.get("/candles/{symbol}")
def candles(symbol: str):
    if engine is None:
        return []
    sym = symbol.replace("-", "/").replace("_", "/")
    return engine.get_candles(sym)


@router.get("/hurst/{symbol}")
def hurst(symbol: str):
    if engine is None:
        return {"hurst": None}
    sym = symbol.replace("-", "/").replace("_", "/")
    c   = engine.get_candles(sym)
    h   = hurst_exponent(c) if len(c) >= 100 else None
    regime = ("mean-reverting" if h and h < 0.45
              else "trending" if h and h > 0.55
              else "random-walk" if h else None)
    return {"symbol": sym, "hurst": round(h, 3) if h else None, "regime": regime}


app.include_router(router)


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in ws_clients:
            ws_clients.remove(websocket)
