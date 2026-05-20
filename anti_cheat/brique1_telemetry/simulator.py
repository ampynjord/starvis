"""
Brique 1 — Simulateur de Télémétrie Souris
===========================================
Génère deux profils de mouvements :
  - Humain légitime : jitter neuromoteur, inertie, micro-corrections
  - Triche aimbot   : correction linéaire mathématique, verrouillage pixel-perfect

Chaque échantillon est sérialisé en JSON conforme au format de log SIEM/Splunk
(champ `event` + `timestamp_ms` + `session_id`).
"""

import json
import math
import random
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Literal

# ---------------------------------------------------------------------------
# Structures de données
# ---------------------------------------------------------------------------

@dataclass
class MouseEvent:
    """Un seul échantillon de télémétrie souris."""
    session_id: str
    timestamp_ms: int
    x: float
    y: float
    dx: float          # déplacement depuis l'échantillon précédent
    dy: float
    event_type: str    # "mouse_move"
    label: str         # "human" | "aimbot" | "unknown"


def _to_siem_record(event: MouseEvent) -> dict:
    """Encapsule un MouseEvent dans une enveloppe SIEM/Splunk standard."""
    return {
        "time": event.timestamp_ms / 1000.0,
        "host": "player_client",
        "source": "triglav:telemetry",
        "sourcetype": "bedr:mouse_event",
        "event": asdict(event),
    }


# ---------------------------------------------------------------------------
# Générateur — Mouvement Humain Légitime
# ---------------------------------------------------------------------------

def _bezier_point(p0, p1, p2, t):
    """Courbe de Bézier quadratique pour simuler une trajectoire naturelle."""
    return (
        (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0],
        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1],
    )


def generate_human_movement(
    start: tuple[float, float],
    end: tuple[float, float],
    n_samples: int = 60,
    jitter_std: float = 1.8,
    inertia_factor: float = 0.35,
    session_id: str | None = None,
    base_timestamp_ms: int | None = None,
) -> list[dict]:
    """
    Simule un déplacement de souris humain avec :
      - trajectoire courbe via Bézier quadratique
      - jitter gaussien (tremblement neuromoteur)
      - inertie (sur-dépassement puis micro-correction)
      - intervalle temporel légèrement variable (~8-16 ms / sample)
    """
    sid = session_id or str(uuid.uuid4())
    t_ms = base_timestamp_ms or int(time.time() * 1000)

    # Point de contrôle Bézier aléatoire → trajectoire non linéaire
    ctrl = (
        (start[0] + end[0]) / 2 + random.gauss(0, 40),
        (start[1] + end[1]) / 2 + random.gauss(0, 40),
    )

    records = []
    prev_x, prev_y = start

    for i in range(n_samples):
        t_param = i / max(n_samples - 1, 1)

        # Position sur la courbe de Bézier
        bx, by = _bezier_point(start, ctrl, end, t_param)

        # Jitter neuromoteur
        bx += random.gauss(0, jitter_std * (1 - t_param * 0.5))
        by += random.gauss(0, jitter_std * (1 - t_param * 0.5))

        # Simulation d'inertie : léger dépassement en fin de trajectoire
        if t_param > 0.85:
            overshoot = 1 + inertia_factor * math.sin((t_param - 0.85) * math.pi / 0.15)
            bx = end[0] + (bx - end[0]) * overshoot
            by = end[1] + (by - end[1]) * overshoot

        # Intervalle temporel variable (8 – 16 ms)
        delta_t = random.randint(8, 16)
        t_ms += delta_t

        event = MouseEvent(
            session_id=sid,
            timestamp_ms=t_ms,
            x=round(bx, 3),
            y=round(by, 3),
            dx=round(bx - prev_x, 3),
            dy=round(by - prev_y, 3),
            event_type="mouse_move",
            label="human",
        )
        records.append(_to_siem_record(event))
        prev_x, prev_y = bx, by

    return records


# ---------------------------------------------------------------------------
# Générateur — Mouvement Aimbot / Smooth-Aim
# ---------------------------------------------------------------------------

def generate_aimbot_movement(
    start: tuple[float, float],
    end: tuple[float, float],
    n_samples: int = 60,
    smooth_factor: float = 0.92,
    pixel_snap_threshold: float = 3.0,
    session_id: str | None = None,
    base_timestamp_ms: int | None = None,
) -> list[dict]:
    """
    Simule un aimbot avec lissage linéaire (smooth-aim) et verrouillage pixel.

    Caractéristiques détectables :
      - Interpolation parfaitement linéaire (absence de jitter naturel)
      - Régularité anormale des angles de virage
      - Snap pixel-perfect quand distance < pixel_snap_threshold
      - Intervalle temporel trop régulier (polling rate fixe)
    """
    sid = session_id or str(uuid.uuid4())
    t_ms = base_timestamp_ms or int(time.time() * 1000)

    records = []
    cx, cy = float(start[0]), float(start[1])
    prev_x, prev_y = cx, cy

    for i in range(n_samples):
        dist = math.hypot(end[0] - cx, end[1] - cy)

        if dist < pixel_snap_threshold:
            # Verrouillage pixel-perfect
            cx, cy = end[0], end[1]
        else:
            # Lissage linéaire pur — aucune inertie, aucun jitter
            cx += (end[0] - cx) * (1 - smooth_factor)
            cy += (end[1] - cy) * (1 - smooth_factor)

        # Polling parfaitement régulier (1 ms de bruit résiduel max)
        t_ms += random.choice([7, 8, 8, 8, 9])

        event = MouseEvent(
            session_id=sid,
            timestamp_ms=t_ms,
            x=round(cx, 3),
            y=round(cy, 3),
            dx=round(cx - prev_x, 3),
            dy=round(cy - prev_y, 3),
            event_type="mouse_move",
            label="aimbot",
        )
        records.append(_to_siem_record(event))
        prev_x, prev_y = cx, cy

    return records


# ---------------------------------------------------------------------------
# Export : flux JSON prêt à envoyer au serveur
# ---------------------------------------------------------------------------

def serialize_session(records: list[dict]) -> str:
    """Sérialise une session en JSON Lines (1 événement par ligne)."""
    return "\n".join(json.dumps(r, ensure_ascii=False) for r in records)


def build_dataset(
    n_human: int = 200,
    n_aimbot: int = 200,
    samples_per_seq: int = 60,
) -> list[dict]:
    """
    Construit un jeu de données équilibré humain / aimbot pour l'entraînement
    de la Brique 2.  Retourne une liste de sessions, chaque session étant
    une liste de records SIEM.
    """
    dataset = []
    t0 = int(time.time() * 1000)

    for _ in range(n_human):
        start = (random.uniform(0, 1920), random.uniform(0, 1080))
        end   = (random.uniform(0, 1920), random.uniform(0, 1080))
        seq   = generate_human_movement(start, end, samples_per_seq,
                                        base_timestamp_ms=t0)
        dataset.append({"label": "human", "sequence": seq})
        t0 += samples_per_seq * 15 + 500

    for _ in range(n_aimbot):
        start = (random.uniform(0, 1920), random.uniform(0, 1080))
        end   = (random.uniform(0, 1920), random.uniform(0, 1080))
        seq   = generate_aimbot_movement(start, end, samples_per_seq,
                                         base_timestamp_ms=t0)
        dataset.append({"label": "aimbot", "sequence": seq})
        t0 += samples_per_seq * 8 + 300

    random.shuffle(dataset)
    return dataset
