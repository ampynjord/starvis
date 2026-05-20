"""
Brique 3 — Télémétrie Fantôme (Active Deception / Network Honeypot)
====================================================================
Paradigme : le serveur injecte dans le flux réseau légitime des entités
« fantômes » (joueurs invisibles et invincibles). Ces entités n'existent
pas côté jeu réel : un client sain les ignorera complètement.

Si les inputs d'un joueur montrent que son viseur suit ou intercepte la
trajectoire d'un fantôme → preuve absolue d'un Wallhack ou d'un
Aim-Assist externe basé sur les paquets réseau.

Architecture Zero-Trust :
  - Le serveur est la seule source de vérité.
  - Le client ne peut pas distinguer un fantôme d'une vraie entité.
  - Aucun fichier scanné, aucun driver kernel nécessaire.
"""

from __future__ import annotations

import math
import random
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Iterator


# ---------------------------------------------------------------------------
# Entité Fantôme
# ---------------------------------------------------------------------------

@dataclass
class PhantomEntity:
    """Représente un joueur fantôme injecté dans le flux réseau."""
    entity_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0          # profondeur (derrière un mur)
    visible: bool = False    # TOUJOURS False dans le flux légitime
    speed: float = 150.0     # px/s en coordonnées écran projetées
    direction_deg: float = 0.0
    created_at: float = field(default_factory=time.time)

    def to_network_packet(self) -> dict:
        """Sérialise l'entité tel qu'elle apparaîtrait dans un vrai paquet réseau."""
        return {
            "type": "entity_update",
            "entity_id": self.entity_id,
            "pos": {"x": round(self.x, 2), "y": round(self.y, 2), "z": round(self.z, 2)},
            "visible": self.visible,
            "ts": round(time.time() * 1000),
        }


# ---------------------------------------------------------------------------
# Gestionnaire de Fantômes
# ---------------------------------------------------------------------------

class PhantomManager:
    """
    Gère le cycle de vie des entités fantômes et les injecte dans
    le flux de paquets réseau à destination du client surveillé.
    """

    def __init__(
        self,
        map_bounds: tuple[float, float, float, float] = (0, 0, 1920, 1080),
        n_phantoms: int = 3,
        ttl_seconds: float = 30.0,
    ):
        self._bounds = map_bounds   # (x_min, y_min, x_max, y_max)
        self._n = n_phantoms
        self._ttl = ttl_seconds
        self._phantoms: dict[str, PhantomEntity] = {}

    def spawn_phantoms(self) -> list[PhantomEntity]:
        """Crée N entités fantômes à des positions aléatoires hors-vision légitime."""
        self._phantoms.clear()
        x_min, y_min, x_max, y_max = self._bounds
        for _ in range(self._n):
            phantom = PhantomEntity(
                x=random.uniform(x_min, x_max),
                y=random.uniform(y_min, y_max),
                z=random.uniform(-500, -100),   # derrière un obstacle
                visible=False,
                speed=random.uniform(80, 220),
                direction_deg=random.uniform(0, 360),
            )
            self._phantoms[phantom.entity_id] = phantom
        return list(self._phantoms.values())

    def tick(self, dt_s: float) -> list[dict]:
        """
        Avance la simulation d'un tick (dt_s secondes) et retourne
        les paquets réseau à injecter dans le flux du client.
        """
        now = time.time()
        packets = []
        expired = []

        for eid, ph in self._phantoms.items():
            if now - ph.created_at > self._ttl:
                expired.append(eid)
                continue

            # Déplacement linéaire avec rebonds sur les bords
            rad = math.radians(ph.direction_deg)
            ph.x += math.cos(rad) * ph.speed * dt_s
            ph.y += math.sin(rad) * ph.speed * dt_s

            x_min, y_min, x_max, y_max = self._bounds
            if ph.x < x_min or ph.x > x_max:
                ph.direction_deg = 180 - ph.direction_deg
                ph.x = max(x_min, min(x_max, ph.x))
            if ph.y < y_min or ph.y > y_max:
                ph.direction_deg = -ph.direction_deg
                ph.y = max(y_min, min(y_max, ph.y))

            packets.append(ph.to_network_packet())

        for eid in expired:
            del self._phantoms[eid]

        return packets

    def get_trajectories(self) -> dict[str, dict]:
        """Retourne les positions actuelles de tous les fantômes (usage serveur)."""
        return {eid: asdict(ph) for eid, ph in self._phantoms.items()}


# ---------------------------------------------------------------------------
# Détecteur de Corrélation (cœur de la Brique 3)
# ---------------------------------------------------------------------------

@dataclass
class HoneypotDetection:
    entity_id: str
    confidence: float          # 0.0 – 1.0
    intercept_count: int
    total_ticks_checked: int
    verdict: str               # "wallhack_detected" | "clean" | "inconclusive"


class HoneypotDetector:
    """
    Compare les inputs souris du joueur (Brique 1) avec la trajectoire
    des entités fantômes (PhantomManager) pour détecter un Wallhack.

    Algorithme :
      Pour chaque tick :
        1. Récupère la position projetée de chaque fantôme (coordonnées écran).
        2. Convertit le viseur du joueur (angle de vue) en coordonnées écran.
        3. Calcule la distance entre le viseur et le fantôme.
        4. Si distance < AIM_RADIUS → "intercept" comptabilisé.
      Après N ticks, si ratio intercept/total > INTERCEPT_RATIO_THRESHOLD → flag.
    """

    AIM_RADIUS_PX = 25.0              # rayon de détection autour du fantôme
    INTERCEPT_RATIO_THRESHOLD = 0.35  # 35 % d'interceptons = impossible au hasard
    MIN_TICKS_FOR_VERDICT = 20        # nombre minimum de ticks avant de conclure

    def __init__(self, phantom_manager: PhantomManager):
        self._pm = phantom_manager
        # Compteurs par entité fantôme
        self._intercepts: dict[str, int] = {}
        self._ticks: dict[str, int] = {}

    def process_tick(
        self,
        player_aim_x: float,
        player_aim_y: float,
    ) -> list[HoneypotDetection]:
        """
        À appeler à chaque tick serveur avec la position du viseur du joueur
        en coordonnées écran (reconstruites depuis les deltas souris de Brique 1).

        Retourne la liste des détections actives.
        """
        trajectories = self._pm.get_trajectories()
        detections = []

        for eid, data in trajectories.items():
            ph_x, ph_y = data["x"], data["y"]
            dist = math.hypot(player_aim_x - ph_x, player_aim_y - ph_y)

            self._ticks[eid] = self._ticks.get(eid, 0) + 1
            if dist < self.AIM_RADIUS_PX:
                self._intercepts[eid] = self._intercepts.get(eid, 0) + 1

            total = self._ticks[eid]
            hits  = self._intercepts.get(eid, 0)
            ratio = hits / total if total > 0 else 0.0

            if total < self.MIN_TICKS_FOR_VERDICT:
                verdict = "inconclusive"
            elif ratio >= self.INTERCEPT_RATIO_THRESHOLD:
                verdict = "wallhack_detected"
            else:
                verdict = "clean"

            detections.append(HoneypotDetection(
                entity_id=eid,
                confidence=round(ratio, 4),
                intercept_count=hits,
                total_ticks_checked=total,
                verdict=verdict,
            ))

        return detections

    def reset(self, entity_id: str | None = None) -> None:
        """Remet à zéro les compteurs (après un respawn, par exemple)."""
        if entity_id:
            self._intercepts.pop(entity_id, None)
            self._ticks.pop(entity_id, None)
        else:
            self._intercepts.clear()
            self._ticks.clear()


# ---------------------------------------------------------------------------
# Utilitaire : reconstituer la position du viseur depuis les deltas souris
# ---------------------------------------------------------------------------

class AimReconstructor:
    """
    Reconstruit la position absolue du viseur à partir des deltas souris
    envoyés par le client (Brique 1). Le serveur est la seule source de
    vérité pour la sensibilité et le FOV.
    """

    def __init__(
        self,
        sensitivity: float = 1.0,
        fov_px_x: float = 1920.0,
        fov_px_y: float = 1080.0,
        start_x: float = 960.0,
        start_y: float = 540.0,
    ):
        self._sens = sensitivity
        self._fov_x = fov_px_x
        self._fov_y = fov_px_y
        self.aim_x = start_x
        self.aim_y = start_y

    def apply_delta(self, dx: float, dy: float) -> tuple[float, float]:
        """Applique un delta souris et retourne la nouvelle position du viseur."""
        self.aim_x = max(0.0, min(self._fov_x, self.aim_x + dx * self._sens))
        self.aim_y = max(0.0, min(self._fov_y, self.aim_y + dy * self._sens))
        return self.aim_x, self.aim_y
