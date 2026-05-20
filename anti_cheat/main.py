"""
Project Triglav — B.E.D.R POC  |  Point d'entrée principal
===========================================================
Orchestre les 3 briques en un pipeline de démonstration local :

  1. Brique 1 : génère des séquences simulées (humain + aimbot)
  2. Brique 2 : entraîne le classificateur, puis prédit sur de nouveaux samples
  3. Brique 3 : lance la simulation honeypot et détecte une corrélation de viseur

Usage :
    python -m anti_cheat.main
    python -m anti_cheat.main --demo honeypot
    python -m anti_cheat.main --demo classifier
"""

import argparse
import json
import math
import random
import time

from anti_cheat.brique1_telemetry.simulator import (
    build_dataset,
    generate_aimbot_movement,
    generate_human_movement,
)
from anti_cheat.brique2_analysis.classifier import BEDRClassifier
from anti_cheat.brique3_deception.honeypot import (
    AimReconstructor,
    HoneypotDetector,
    PhantomManager,
)


# ---------------------------------------------------------------------------
# Démo Brique 2 — Classificateur
# ---------------------------------------------------------------------------

def demo_classifier(n_human: int = 300, n_aimbot: int = 300) -> None:
    print("\n" + "=" * 60)
    print("  BRIQUE 2 — Classificateur Biométrique B.E.D.R")
    print("=" * 60)

    print(f"\n[1/3] Génération de {n_human} séquences humaines + {n_aimbot} aimbot…")
    dataset = build_dataset(n_human=n_human, n_aimbot=n_aimbot, samples_per_seq=60)
    print(f"      {len(dataset)} séquences générées.")

    print("\n[2/3] Entraînement du Random Forest + Isolation Forest…")
    clf = BEDRClassifier()
    clf.train(dataset)

    print("\n[3/3] Prédictions sur de nouvelles séquences (non vues) :")

    # --- Séquence humaine inconnue ---
    seq_human = generate_human_movement(
        start=(100, 100), end=(800, 600), n_samples=60,
        jitter_std=2.0, inertia_factor=0.4,
    )
    result_h = clf.predict(seq_human)
    print(f"\n  Séquence HUMAINE → RF: {result_h['rf_verdict'].upper()}"
          f"  (p_cheat={result_h['rf_proba_cheat']:.3f})"
          f"  Anomalie: {result_h['anomaly_verdict']}")

    # --- Séquence aimbot inconnue ---
    seq_bot = generate_aimbot_movement(
        start=(50, 50), end=(1500, 900), n_samples=60,
        smooth_factor=0.94,
    )
    result_b = clf.predict(seq_bot)
    print(f"  Séquence AIMBOT  → RF: {result_b['rf_verdict'].upper()}"
          f"  (p_cheat={result_b['rf_proba_cheat']:.3f})"
          f"  Anomalie: {result_b['anomaly_verdict']}")

    print("\n  Features clés (séquence aimbot) :")
    key_feats = ["vel_std", "angle_std", "dt_cv", "linearity", "path_efficiency",
                 "micro_stop_ratio"]
    for k in key_feats:
        print(f"    {k:22s}: {result_b['features'].get(k, '?'):.4f}")


# ---------------------------------------------------------------------------
# Démo Brique 3 — Honeypot
# ---------------------------------------------------------------------------

def demo_honeypot(
    n_ticks: int = 100,
    simulate_wallhack: bool = True,
) -> None:
    print("\n" + "=" * 60)
    print("  BRIQUE 3 — Télémétrie Fantôme / Network Honeypot")
    print("=" * 60)
    mode = "WALLHACK SIMULÉ" if simulate_wallhack else "JOUEUR LÉGITIME"
    print(f"\n  Mode : {mode}  |  {n_ticks} ticks")

    manager = PhantomManager(n_phantoms=2)
    phantoms = manager.spawn_phantoms()
    print(f"\n  {len(phantoms)} entités fantômes injectées dans le flux réseau :")
    for ph in phantoms:
        print(f"    [{ph.entity_id[:8]}…] pos=({ph.x:.0f},{ph.y:.0f})  visible=False")

    detector = HoneypotDetector(manager)
    reconstructor = AimReconstructor()

    dt = 0.05  # 50 ms / tick (20 TPS serveur)

    for tick in range(n_ticks):
        # Avance la simulation des fantômes
        manager.tick(dt)
        traj = manager.get_trajectories()

        if simulate_wallhack:
            # Le tricher suit le premier fantôme (wallhack parfait)
            first_eid = next(iter(traj))
            target_x = traj[first_eid]["x"]
            target_y = traj[first_eid]["y"]
            # Mouvement vers la cible avec légère imprécision pour réalisme
            aim_x = reconstructor.aim_x + (target_x - reconstructor.aim_x) * 0.3 + random.gauss(0, 2)
            aim_y = reconstructor.aim_y + (target_y - reconstructor.aim_y) * 0.3 + random.gauss(0, 2)
            reconstructor.aim_x = aim_x
            reconstructor.aim_y = aim_y
        else:
            # Joueur légitime : mouvement aléatoire naturel
            reconstructor.apply_delta(
                random.gauss(0, 15),
                random.gauss(0, 10),
            )

        detections = detector.process_tick(reconstructor.aim_x, reconstructor.aim_y)

        if tick % 20 == 0:
            for det in detections:
                print(f"  [Tick {tick:03d}] Entité {det.entity_id[:8]}…"
                      f"  hits={det.intercept_count}/{det.total_ticks_checked}"
                      f"  confidence={det.confidence:.2f}"
                      f"  → {det.verdict.upper()}")

    print("\n  VERDICT FINAL :")
    for det in detections:
        flag = "🚨 TRICHE" if det.verdict == "wallhack_detected" else "✅ CLEAN"
        print(f"    {flag}  —  entité {det.entity_id[:8]}…  "
              f"ratio={det.confidence:.2%}  ({det.intercept_count}/{det.total_ticks_checked})")


# ---------------------------------------------------------------------------
# Pipeline complet
# ---------------------------------------------------------------------------

def demo_full() -> None:
    demo_classifier()
    demo_honeypot(simulate_wallhack=True)
    demo_honeypot(simulate_wallhack=False)


# ---------------------------------------------------------------------------
# Entrée CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Project Triglav — B.E.D.R POC")
    parser.add_argument(
        "--demo",
        choices=["classifier", "honeypot", "honeypot_clean", "full"],
        default="full",
        help="Quelle démonstration lancer (défaut: full)",
    )
    args = parser.parse_args()

    if args.demo == "classifier":
        demo_classifier()
    elif args.demo == "honeypot":
        demo_honeypot(simulate_wallhack=True)
    elif args.demo == "honeypot_clean":
        demo_honeypot(simulate_wallhack=False)
    else:
        demo_full()
