import os
from dotenv import load_dotenv

load_dotenv()

BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_SECRET  = os.getenv("BINANCE_SECRET", "")
BINANCE_DEMO    = os.getenv("BINANCE_DEMO", "true").lower() == "true"

SYMBOLS_RAW = os.getenv("SYMBOLS", "BTC/USDT:USDT,ETH/USDT:USDT")
SYMBOLS     = [s.strip() for s in SYMBOLS_RAW.split(",")]

INITIAL_CAPITAL    = float(os.getenv("INITIAL_CAPITAL", "10000"))
MAX_RISK_PER_TRADE = float(os.getenv("MAX_RISK_PER_TRADE", "0.02"))
LEVERAGE           = int(os.getenv("LEVERAGE", "10"))   # apalancamiento simulado (Futures)
# Railway inyecta $PORT; en local usamos API_PORT o 8001
API_PORT           = int(os.getenv("PORT") or os.getenv("API_PORT", "8001"))

CANDLE_BUFFER_SIZE = 300
CANDLE_TIMEFRAME   = "1m"
DB_PATH            = os.getenv("DB_PATH", "crypto_bot.db")

# WebSocket real de producción — datos de mercado reales (independiente de demo/testnet)
WS_BASE_MARKET = "wss://fstream.binance.com/stream"

# REST para datos históricos públicos (no necesita auth)
REST_BASE_PUBLIC = "https://fapi.binance.com"

# REST demo para órdenes simuladas
REST_BASE_DEMO = "https://demo-fapi.binance.com"
