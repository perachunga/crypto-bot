"""
SQLite database — trades, positions, equity snapshots, strategy configs.
"""
import json
import statistics
import uuid
from datetime import datetime
from sqlalchemy import (
    create_engine, text, MetaData, Table, Column,
    String, Float, Boolean, DateTime, Text
)
from config import DB_PATH

engine   = create_engine(f"sqlite:///{DB_PATH}", echo=False)
metadata = MetaData()

strategies_table = Table("strategies", metadata,
    Column("name",       String,  primary_key=True),
    Column("params",     Text,    nullable=False, default="{}"),
    Column("enabled",    Boolean, default=True),
    Column("created_at", DateTime, default=datetime.utcnow),
)

trades_table = Table("trades", metadata,
    Column("id",            String,  primary_key=True),
    Column("strategy_name", String,  nullable=False),
    Column("symbol",        String,  nullable=False),
    Column("side",          String,  nullable=False),
    Column("entry_price",   Float,   nullable=False),
    Column("exit_price",    Float,   nullable=False),
    Column("size",          Float,   nullable=False),
    Column("pnl",           Float,   nullable=False),
    Column("pnl_pct",       Float,   nullable=False),
    Column("opened_at",     DateTime, nullable=False),
    Column("closed_at",     DateTime, nullable=False),
    Column("reason_entry",  Text),
    Column("reason_exit",   Text),
)

positions_table = Table("positions", metadata,
    Column("id",            String,  primary_key=True),
    Column("strategy_name", String,  nullable=False),
    Column("symbol",        String,  nullable=False),
    Column("side",          String,  nullable=False),
    Column("entry_price",   Float,   nullable=False),
    Column("size",          Float,   nullable=False),
    Column("stop_loss",     Float),
    Column("take_profit",   Float),
    Column("opened_at",     DateTime, nullable=False),
)

equity_table = Table("equity_snapshots", metadata,
    Column("id",            String,  primary_key=True),
    Column("strategy_name", String,  nullable=False),
    Column("equity",        Float,   nullable=False),
    Column("timestamp",     DateTime, nullable=False),
)


def init_db():
    metadata.create_all(engine)


# ── Escritura ─────────────────────────────────────────────────────────────────

def save_trade(trade: dict):
    with engine.begin() as conn:
        conn.execute(trades_table.insert().values(**trade))


def save_position(position: dict):
    with engine.begin() as conn:
        conn.execute(positions_table.insert().values(**position))


def delete_position(position_id: str):
    with engine.begin() as conn:
        conn.execute(
            positions_table.delete().where(positions_table.c.id == position_id)
        )


def save_equity_snapshot(snapshot: dict):
    with engine.begin() as conn:
        conn.execute(equity_table.insert().values(**snapshot))


def upsert_strategy(name: str, params: dict, enabled: bool = True):
    with engine.begin() as conn:
        existing = conn.execute(
            strategies_table.select().where(strategies_table.c.name == name)
        ).fetchone()
        if existing:
            conn.execute(
                strategies_table.update()
                .where(strategies_table.c.name == name)
                .values(params=json.dumps(params), enabled=enabled)
            )
        else:
            conn.execute(strategies_table.insert().values(
                name=name, params=json.dumps(params),
                enabled=enabled, created_at=datetime.utcnow(),
            ))


def reset_strategy_db(name: str):
    """
    Limpia el historial de equity para que la curva empiece desde cero.
    Los trades se conservan para análisis histórico.
    Las posiciones abiertas se cierran antes (desde paper_trader.reset_strategy).
    """
    with engine.begin() as conn:
        conn.execute(
            equity_table.delete().where(equity_table.c.strategy_name == name)
        )


# ── Lectura ───────────────────────────────────────────────────────────────────

def get_trades(strategy_name: str | None = None, limit: int = 500) -> list[dict]:
    with engine.connect() as conn:
        q = trades_table.select().order_by(trades_table.c.closed_at.desc()).limit(limit)
        if strategy_name:
            q = q.where(trades_table.c.strategy_name == strategy_name)
        return [dict(r) for r in conn.execute(q).mappings().all()]


def get_positions() -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            positions_table.select().order_by(positions_table.c.opened_at.desc())
        ).mappings().all()
        return [dict(r) for r in rows]


def get_positions_by_strategy(strategy_name: str) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            positions_table.select().where(positions_table.c.strategy_name == strategy_name)
        ).mappings().all()
        return [dict(r) for r in rows]


def get_equity_snapshots(strategy_name: str | None = None, limit: int = 1000) -> list[dict]:
    with engine.connect() as conn:
        q = equity_table.select().order_by(equity_table.c.timestamp.asc()).limit(limit)
        if strategy_name:
            q = q.where(equity_table.c.strategy_name == strategy_name)
        return [dict(r) for r in conn.execute(q).mappings().all()]


def get_strategy_configs() -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(strategies_table.select()).mappings().all()
        return [
            {**dict(r), "params": json.loads(r["params"])}
            for r in rows
        ]


def get_strategy_metrics(strategy_name: str) -> dict:
    trades = get_trades(strategy_name=strategy_name)
    if not trades:
        return {
            "strategy": strategy_name, "trades": 0, "win_rate": 0,
            "total_pnl": 0, "avg_win": 0, "avg_loss": 0,
            "max_drawdown": 0, "sharpe": 0,
        }

    pnls   = [t["pnl"] for t in trades]
    wins   = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    win_rate  = len(wins) / len(pnls)
    total_pnl = sum(pnls)
    avg_win   = sum(wins) / len(wins) if wins else 0
    avg_loss  = sum(losses) / len(losses) if losses else 0

    cumulative, peak, max_dd = 0.0, 0.0, 0.0
    for p in reversed(pnls):
        cumulative += p
        peak = max(peak, cumulative)
        dd = (peak - cumulative) / peak if peak > 0 else 0
        max_dd = max(max_dd, dd)

    sharpe = 0.0
    if len(pnls) > 1:
        mean_pnl = statistics.mean(pnls)
        std_pnl  = statistics.stdev(pnls)
        sharpe   = (mean_pnl / std_pnl) * (252 ** 0.5) if std_pnl > 0 else 0

    return {
        "strategy":     strategy_name,
        "trades":       len(pnls),
        "win_rate":     round(win_rate * 100, 1),
        "total_pnl":    round(total_pnl, 2),
        "avg_win":      round(avg_win, 2),
        "avg_loss":     round(avg_loss, 2),
        "max_drawdown": round(max_dd * 100, 1),
        "sharpe":       round(sharpe, 2),
    }


def get_all_metrics() -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT DISTINCT strategy_name FROM trades")).fetchall()
    return [get_strategy_metrics(r[0]) for r in rows]
