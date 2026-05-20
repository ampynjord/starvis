"""
Brique 2 — Classificateur Biométrique (Random Forest + Isolation Forest)
=========================================================================
Deux modèles complémentaires :

  1. RandomForestClassifier  — supervisé, entraîné sur données simulées.
     Sortie : label binaire + probabilité de triche.

  2. IsolationForest          — non supervisé, détecte les anomalies
     comportementales sans étiquettes. Utile pour les 0-days de triche.

Choix technique :
  scikit-learn est retenu pour le POC car il ne nécessite pas de GPU,
  s'entraîne en quelques secondes sur quelques centaines de séquences
  et produit des probabilités calibrées facilement interprétables.
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np

try:
    from sklearn.ensemble import IsolationForest, RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import classification_report
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False
    print("[BEDR] AVERTISSEMENT : scikit-learn absent. Installer avec : pip install scikit-learn")

from anti_cheat.brique2_analysis.features import extract_features


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

FEATURE_NAMES = [
    "vel_mean", "vel_std", "vel_max", "vel_min",
    "accel_mean", "accel_std", "accel_max",
    "angle_mean", "angle_std", "angle_max",
    "curv_mean", "curv_std",
    "micro_stop_ratio",
    "dt_mean", "dt_std", "dt_cv",
    "linearity", "path_efficiency",
]

CHEAT_THRESHOLD = 0.60  # probabilité au-delà de laquelle on flag "cheat"


# ---------------------------------------------------------------------------
# Classe principale
# ---------------------------------------------------------------------------

class BEDRClassifier:
    """
    Encapsule les deux modèles (supervisé + non supervisé) et expose
    une API unifiée d'entraînement et de prédiction.
    """

    def __init__(self):
        if not _SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn requis : pip install scikit-learn")

        self.rf = RandomForestClassifier(
            n_estimators=200,
            max_depth=12,
            class_weight="balanced",  # données potentiellement déséquilibrées
            random_state=42,
            n_jobs=-1,
        )
        self.iforest = IsolationForest(
            n_estimators=150,
            contamination=0.2,  # ~20 % d'anomalies estimées dans le trafic
            random_state=42,
        )
        self.scaler = StandardScaler()
        self._trained = False

    # ------------------------------------------------------------------
    # Entraînement
    # ------------------------------------------------------------------

    def train(self, dataset: list[dict]) -> dict[str, Any]:
        """
        Entraîne les deux modèles sur le dataset généré par la Brique 1.

        `dataset` : liste de {"label": "human"|"aimbot", "sequence": [records]}

        Retourne un rapport de métriques.
        """
        X, y = [], []
        for item in dataset:
            feats = extract_features(item["sequence"])
            if feats is None:
                continue
            X.append([feats[f] for f in FEATURE_NAMES])
            y.append(1 if item["label"] == "aimbot" else 0)

        X = np.array(X, dtype=np.float32)
        y = np.array(y, dtype=np.int32)

        X_scaled = self.scaler.fit_transform(X)

        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=0.25, stratify=y, random_state=42
        )

        # Supervisé
        self.rf.fit(X_train, y_train)
        rf_report = classification_report(
            y_test, self.rf.predict(X_test),
            target_names=["human", "aimbot"],
            output_dict=True,
        )

        # Non supervisé (entraîné sur le jeu complet)
        self.iforest.fit(X_scaled)

        self._trained = True
        print("[BEDR] Entraînement terminé.")
        print(classification_report(y_test, self.rf.predict(X_test),
                                    target_names=["human", "aimbot"]))
        return rf_report

    # ------------------------------------------------------------------
    # Prédiction
    # ------------------------------------------------------------------

    def predict(self, sequence: list[dict]) -> dict[str, Any]:
        """
        Analyse une séquence live et retourne une décision de détection.

        Retourne un dict contenant :
          - `rf_proba_cheat`  : probabilité aimbot selon RF (0–1)
          - `rf_verdict`      : "cheat" | "clean"
          - `anomaly_score`   : score d'isolation (>0 = normal, <0 = anomalie)
          - `anomaly_verdict` : "anomaly" | "normal"
          - `features`        : features extraites
        """
        if not self._trained:
            raise RuntimeError("Le modèle n'est pas encore entraîné. Appeler .train() d'abord.")

        feats = extract_features(sequence)
        if feats is None:
            return {"error": "Séquence trop courte pour l'analyse"}

        X_raw = np.array([[feats[f] for f in FEATURE_NAMES]], dtype=np.float32)
        X = self.scaler.transform(X_raw)

        rf_proba = self.rf.predict_proba(X)[0][1]  # prob classe "aimbot"
        anomaly_score = self.iforest.score_samples(X)[0]

        return {
            "rf_proba_cheat":  round(float(rf_proba), 4),
            "rf_verdict":      "cheat" if rf_proba >= CHEAT_THRESHOLD else "clean",
            "anomaly_score":   round(float(anomaly_score), 4),
            "anomaly_verdict": "anomaly" if anomaly_score < -0.1 else "normal",
            "features":        {k: round(v, 4) for k, v in feats.items()},
        }

    # ------------------------------------------------------------------
    # Persistance
    # ------------------------------------------------------------------

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        with open(path / "bedr_rf.pkl", "wb") as f:
            pickle.dump(self.rf, f)
        with open(path / "bedr_iforest.pkl", "wb") as f:
            pickle.dump(self.iforest, f)
        with open(path / "bedr_scaler.pkl", "wb") as f:
            pickle.dump(self.scaler, f)
        print(f"[BEDR] Modèles sauvegardés dans {path}")

    def load(self, path: str | Path) -> None:
        path = Path(path)
        with open(path / "bedr_rf.pkl", "rb") as f:
            self.rf = pickle.load(f)
        with open(path / "bedr_iforest.pkl", "rb") as f:
            self.iforest = pickle.load(f)
        with open(path / "bedr_scaler.pkl", "rb") as f:
            self.scaler = pickle.load(f)
        self._trained = True
        print(f"[BEDR] Modèles chargés depuis {path}")
