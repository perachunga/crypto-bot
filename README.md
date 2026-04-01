# Crypto Bot

Paper trading bot con dashboard. Estrategias: RSI, Mean Reversion (Z-score + Kalman), Order Flow (CVD + OBI).

## Setup

### 1. API keys de Binance Futures Testnet

Regístrate en https://testnet.binancefuture.com → API Management → crear clave.

### 2. Configurar .env

```bash
cp .env.example .env
# Editar .env con tus API keys
```

### 3. Instalar dependencias Python

```bash
cd /Users/Pablo/Desktop/crypto-bot
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 4. Instalar dependencias del dashboard

```bash
cd dashboard
npm install
```

## Arrancar

**Terminal 1 — Backend:**
```bash
cd /Users/Pablo/Desktop/crypto-bot/src
../.venv/bin/python main.py
```

**Terminal 2 — Dashboard:**
```bash
cd /Users/Pablo/Desktop/crypto-bot/dashboard
npm run dev
```

Dashboard en: http://localhost:5174

## Estrategias

| Estrategia | Señal de entrada | Salida |
|-----------|-----------------|--------|
| `RSI` | RSI < 30 (long) / RSI > 70 (short) + volumen elevado | SL/TP por ATR |
| `MeanRev_Z` | Z-score < -2 (long) / > 2 (short) | Z-score vuelve a 0 o SL/TP |
| `KalmanMR` | Precio desvía >0.5% del estimado Kalman | Price vuelve al estimado |
| `OFlow_CVD` | Divergencia CVD + confirmación order book | SL/TP por ATR |
| `OFlow_OBI` | Imbalance extremo en order book + EMA trend | SL/TP por ATR |

## Añadir nueva estrategia

1. Crear `src/strategies/mi_estrategia.py` heredando de `Strategy`
2. Implementar `analyze()` → devuelve `Signal` o `None`
3. Añadir a la lista en `strategy_engine.py` → `_build_strategies()`

## Pasar a live trading

Cambiar en `.env`:
```
BINANCE_TESTNET=false
```
Y reemplazar `paper_trader.py` por el ejecutor real (CCXT `create_order()`).
