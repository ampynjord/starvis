"""
Brique 2 — Extraction de Features Biométriques
===============================================
Transforme une séquence brute de MouseEvents (format SIEM) en vecteur
de features numériques exploitable par un modèle de classification.

Signaux faibles ciblés :
  - Vélocité et accélération scalaire (distribution, outliers)
  - Régularité angulaire (variance des changements de direction)
  - Micro-arrêts (pauses < 2 px de déplacement)
  - Courbure locale (déviation par rapport à la droite idéale)
  - Régularité temporelle (variance des deltas entre échantillons)
"""

import math
import statistics
from typing import Any


# ---------------------------------------------------------------------------
# Helpers cinématiques
# ---------------------------------------------------------------------------

def _velocity(dx: float, dy: float, dt_ms: float) -> float:
    """px / ms"""
    if dt_ms <= 0:
        return 0.0
    return math.hypot(dx, dy) / dt_ms


def _acceleration(v1: float, v2: float, dt_ms: float) -> float:
    if dt_ms <= 0:
        return 0.0
    return (v2 - v1) / dt_ms


def _angle_change(dx1, dy1, dx2, dy2) -> float:
    """Angle en degrés entre deux vecteurs de déplacement successifs."""
    dot = dx1 * dx2 + dy1 * dy2
    mag1 = math.hypot(dx1, dy1)
    mag2 = math.hypot(dx2, dy2)
    if mag1 * mag2 == 0:
        return 0.0
    cos_a = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_a))


def _curvature(x0, y0, x1, y1, x2, y2) -> float:
    """
    Courbure de Menger (rayon de courbure inverse) pour 3 points consécutifs.
    Une valeur élevée = virage serré ; 0 = droite parfaite.
    """
    # Aire du triangle formé par les 3 points
    area = abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2
    d01 = math.hypot(x1 - x0, y1 - y0)
    d12 = math.hypot(x2 - x1, y2 - y1)
    d02 = math.hypot(x2 - x0, y2 - y0)
    denom = d01 * d12 * d02
    return (2 * area / denom) if denom > 1e-9 else 0.0


# ---------------------------------------------------------------------------
# Extraction principale
# ---------------------------------------------------------------------------

def extract_features(sequence: list[dict]) -> dict[str, float] | None:
    """
    Reçoit une séquence de records SIEM (format Brique 1) et retourne
    un dictionnaire de 18 features biométriques.

    Retourne None si la séquence est trop courte pour être analysée.
    """
    events = [r["event"] for r in sequence]
    n = len(events)
    if n < 5:
        return None

    timestamps = [e["timestamp_ms"] for e in events]
    xs = [e["x"] for e in events]
    ys = [e["y"] for e in events]
    dxs = [e["dx"] for e in events]
    dys = [e["dy"] for e in events]

    # ── Deltas temporels ──────────────────────────────────────────────
    dt_list = [max(timestamps[i] - timestamps[i - 1], 1) for i in range(1, n)]

    # ── Vélocités ─────────────────────────────────────────────────────
    vels = [_velocity(dxs[i], dys[i], dt_list[i - 1]) for i in range(1, n)]

    # ── Accélérations ─────────────────────────────────────────────────
    accels = [
        abs(_acceleration(vels[i - 1], vels[i], dt_list[i - 1]))
        for i in range(1, len(vels))
    ]

    # ── Angles de virage ──────────────────────────────────────────────
    angles = [
        _angle_change(dxs[i], dys[i], dxs[i + 1], dys[i + 1])
        for i in range(n - 2)
    ]

    # ── Courbures locales ─────────────────────────────────────────────
    curvatures = [
        _curvature(xs[i], ys[i], xs[i + 1], ys[i + 1], xs[i + 2], ys[i + 2])
        for i in range(n - 2)
    ]

    # ── Micro-arrêts (déplacement < 2 px) ────────────────────────────
    micro_stops = sum(1 for dx, dy in zip(dxs[1:], dys[1:]) if math.hypot(dx, dy) < 2.0)
    micro_stop_ratio = micro_stops / max(n - 1, 1)

    def _safe_stat(lst, func):
        return func(lst) if len(lst) >= 2 else 0.0

    features = {
        # Vélocité
        "vel_mean":       _safe_stat(vels, statistics.mean),
        "vel_std":        _safe_stat(vels, statistics.stdev),
        "vel_max":        max(vels) if vels else 0.0,
        "vel_min":        min(vels) if vels else 0.0,
        # Accélération
        "accel_mean":     _safe_stat(accels, statistics.mean),
        "accel_std":      _safe_stat(accels, statistics.stdev),
        "accel_max":      max(accels) if accels else 0.0,
        # Angles de virage
        "angle_mean":     _safe_stat(angles, statistics.mean),
        "angle_std":      _safe_stat(angles, statistics.stdev),
        "angle_max":      max(angles) if angles else 0.0,
        # Courbure
        "curv_mean":      _safe_stat(curvatures, statistics.mean),
        "curv_std":       _safe_stat(curvatures, statistics.stdev),
        # Micro-arrêts
        "micro_stop_ratio": micro_stop_ratio,
        # Régularité temporelle
        "dt_mean":        _safe_stat(dt_list, statistics.mean),
        "dt_std":         _safe_stat(dt_list, statistics.stdev),
        "dt_cv":          (
            _safe_stat(dt_list, statistics.stdev) /
            max(_safe_stat(dt_list, statistics.mean), 1e-9)
        ),  # Coefficient de variation — proche de 0 chez l'aimbot
        # Linéarité globale : corrélation rang de Pearson entre x et y
        "linearity":      _pearson_r(xs, ys),
        # Distance totale / distance euclidienne start→end (ratio de détour)
        "path_efficiency": _path_efficiency(xs, ys),
    }
    return features


def _pearson_r(xs: list[float], ys: list[float]) -> float:
    """Corrélation de Pearson entre x et y — élevée pour trajectoires linéaires."""
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx2 = sum((x - mx) ** 2 for x in xs)
    dy2 = sum((y - my) ** 2 for y in ys)
    denom = math.sqrt(dx2 * dy2)
    return abs(num / denom) if denom > 1e-9 else 0.0


def _path_efficiency(xs: list[float], ys: list[float]) -> float:
    """Ratio distance directe / chemin réel. Proche de 1 = ligne droite (aimbot)."""
    if len(xs) < 2:
        return 1.0
    direct = math.hypot(xs[-1] - xs[0], ys[-1] - ys[0])
    traveled = sum(math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) for i in range(1, len(xs)))
    return direct / traveled if traveled > 1e-9 else 1.0
