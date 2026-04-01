-- Script informativo — la DB se crea automáticamente al arrancar el bot (SQLite + SQLAlchemy)
-- Este archivo sirve como referencia del schema

CREATE TABLE IF NOT EXISTS strategies (
    name TEXT PRIMARY KEY,
    params TEXT NOT NULL DEFAULT '{}',
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    strategy_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    size REAL NOT NULL,
    pnl REAL NOT NULL,
    pnl_pct REAL NOT NULL,
    opened_at DATETIME NOT NULL,
    closed_at DATETIME NOT NULL,
    reason_entry TEXT,
    reason_exit TEXT
);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    strategy_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    entry_price REAL NOT NULL,
    size REAL NOT NULL,
    stop_loss REAL,
    take_profit REAL,
    opened_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS equity_snapshots (
    id TEXT PRIMARY KEY,
    strategy_name TEXT NOT NULL,
    equity REAL NOT NULL,
    timestamp DATETIME NOT NULL
);

-- Índices útiles para el dashboard
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy_name);
CREATE INDEX IF NOT EXISTS idx_trades_closed ON trades(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_equity_strategy ON equity_snapshots(strategy_name, timestamp);
