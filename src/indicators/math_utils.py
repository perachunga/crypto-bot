"""
Herramientas matemáticas avanzadas:
- Z-score / Kalman Filter para mean reversion
- KellySizer con Bayesian blending (funciona desde el trade 0)
- Hurst Exponent para detectar régimen
"""
import numpy as np
from scipy import stats


# ── Z-Score ───────────────────────────────────────────────────────────────────

def zscore(candles: list[dict], period: int = 20) -> float | None:
    if len(candles) < period:
        return None
    closes = [c["close"] for c in candles]
    window = closes[-period:]
    mean   = np.mean(window)
    std    = np.std(window)
    if std == 0:
        return None
    return float((closes[-1] - mean) / std)


# ── Kalman Filter ─────────────────────────────────────────────────────────────

class KalmanFilter:
    def __init__(self, process_noise: float = 1e-3, observation_noise: float = 0.1):
        self.Q = process_noise
        self.R = observation_noise
        self.x = None
        self.P = 1.0

    def update(self, price: float) -> float:
        if self.x is None:
            self.x = price
            return price
        P_pred = self.P + self.Q
        K      = P_pred / (P_pred + self.R)
        self.x = self.x + K * (price - self.x)
        self.P = (1 - K) * P_pred
        return float(self.x)

    def deviation(self, price: float) -> float:
        return float(price - self.x) if self.x is not None else 0.0


# ── Hurst Exponent ────────────────────────────────────────────────────────────

def hurst_exponent(candles: list[dict], min_period: int = 10) -> float | None:
    if len(candles) < 100:
        return None
    closes   = np.array([c["close"] for c in candles], dtype=float)
    lags     = range(min_period, min(len(closes) // 2, 50))
    tau, rs_vals = [], []
    for lag in lags:
        segments = len(closes) // lag
        if segments < 2:
            continue
        rs_list = []
        for i in range(segments):
            chunk = closes[i * lag:(i + 1) * lag]
            mean  = np.mean(chunk)
            devs  = np.cumsum(chunk - mean)
            r     = np.max(devs) - np.min(devs)
            s     = np.std(chunk)
            if s > 0:
                rs_list.append(r / s)
        if rs_list:
            tau.append(lag)
            rs_vals.append(np.mean(rs_list))
    if len(tau) < 2:
        return None
    slope, *_ = stats.linregress(np.log(tau), np.log(rs_vals))
    return float(slope)


# ── Volatility ────────────────────────────────────────────────────────────────

def realized_volatility(candles: list[dict], period: int = 20) -> float:
    """Volatilidad anualizada de log-returns. Usada por el market maker."""
    if len(candles) < period + 1:
        return 0.01  # default 1% por vela
    closes  = np.array([c["close"] for c in candles[-period - 1:]], dtype=float)
    returns = np.diff(np.log(closes))
    sigma   = float(np.std(returns))
    # Anualizamos: 1-min candles → 525,600 periodos/año
    return sigma * np.sqrt(525_600)


# ── Kelly Criterion con Bayesian blending ─────────────────────────────────────

class KellySizer:
    """
    Kelly Criterion funciona desde el trade 0 usando un prior Bayesiano.

    El prior refleja el R/R esperado de la estrategia (calculado desde SL/TP).
    Conforme se acumulan trades reales, el prior pierde peso gradualmente.

    N_PRIOR = 10 significa que los primeros 10 trades reales valen igual que el prior.
    Después, los datos reales dominan completamente.

    Ejemplo: RSI con SL=1.5×ATR, TP=2.5×ATR → R/R=1.67
      Prior: WR=0.45, avg_win=1.67, avg_loss=1.0
      Kelly: f = (0.45*1.67 - 0.55) / 1.67 ≈ 0.12
      Quarter-Kelly: 0.03 (3% del capital) ← arranque conservador
    """

    N_PRIOR = 10       # trades imaginarios del prior
    MAX_FRAC = 0.20    # nunca más del 20% del capital (margen) en un trade

    def __init__(self, prior_win_rate: float, prior_rr: float):
        """
        prior_win_rate: WR esperado de la estrategia (0-1)
        prior_rr: risk/reward esperado (tp_dist / sl_dist)
                  ej: SL=1.5×ATR, TP=2.5×ATR → prior_rr = 2.5/1.5 = 1.67
        """
        self.prior_wr = prior_win_rate
        self.prior_aw = prior_rr   # avg_win normalizado (riesgo = 1)
        self.prior_al = 1.0

    def fraction(
        self,
        n_trades:   int,
        actual_wr:  float | None,
        actual_aw:  float | None,
        actual_al:  float | None,
    ) -> float:
        N = self.N_PRIOR

        if n_trades > 0 and actual_wr is not None and actual_aw is not None and actual_al is not None:
            w  = n_trades / (n_trades + N)
            wr = self.prior_wr * (1 - w) + actual_wr          * w
            aw = self.prior_aw * (1 - w) + actual_aw          * w
            al = self.prior_al * (1 - w) + abs(actual_al)     * w
        else:
            wr, aw, al = self.prior_wr, self.prior_aw, self.prior_al

        f = kelly_fraction(wr, aw, al)
        return min(f * 0.5, self.MAX_FRAC)    # half-Kelly con cap

    def size_usdt(
        self,
        capital:    float,
        n_trades:   int,
        actual_wr:  float | None = None,
        actual_aw:  float | None = None,
        actual_al:  float | None = None,
    ) -> float:
        frac = self.fraction(n_trades, actual_wr, actual_aw, actual_al)
        return round(capital * frac, 2)


def kelly_fraction(win_rate: float, avg_win: float, avg_loss: float) -> float:
    if avg_loss == 0 or avg_win <= 0:
        return 0.0
    b = avg_win / abs(avg_loss)
    q = 1 - win_rate
    return max(0.0, float((win_rate * b - q) / b))


def quarter_kelly(win_rate: float, avg_win: float, avg_loss: float) -> float:
    return kelly_fraction(win_rate, avg_win, avg_loss) * 0.25
