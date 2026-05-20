"""
Brique 1 — Collecteur de Télémétrie (Transport Client → Serveur)
=================================================================
Implémente un faux "agent" client qui buffurise les MouseEvents et les
envoie périodiquement au serveur d'analyse via HTTP POST (JSON Lines).

En conditions réelles, ce module tournerait en espace utilisateur sur
le PC du joueur ; aucun accès kernel requis (paradigme Zero-Trust).
"""

import json
import queue
import threading
import time
import urllib.error
import urllib.request
from typing import Callable


class TelemetryCollector:
    """
    Buffer thread-safe des événements souris.

    Usage :
        collector = TelemetryCollector(server_url="http://localhost:8765/ingest")
        collector.start()
        collector.push(siem_record)   # appelé depuis le hook d'input
        ...
        collector.stop()
    """

    def __init__(
        self,
        server_url: str = "http://localhost:8765/ingest",
        flush_interval_s: float = 0.5,
        max_buffer_size: int = 500,
        on_flush_error: Callable[[Exception], None] | None = None,
    ):
        self._server_url = server_url
        self._flush_interval = flush_interval_s
        self._max_buffer = max_buffer_size
        self._on_flush_error = on_flush_error or (lambda e: print(f"[Collector] Flush error: {e}"))

        self._queue: queue.Queue[dict] = queue.Queue(maxsize=max_buffer_size)
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._flush_loop, daemon=True)

    # ------------------------------------------------------------------
    # API publique
    # ------------------------------------------------------------------

    def start(self) -> None:
        self._thread.start()

    def stop(self, drain: bool = True) -> None:
        """Arrête le collecteur. Si drain=True, vide le buffer avant de stopper."""
        self._stop_event.set()
        self._thread.join(timeout=5)
        if drain:
            self._flush()

    def push(self, record: dict) -> bool:
        """Ajoute un événement SIEM dans le buffer. Retourne False si buffer plein."""
        try:
            self._queue.put_nowait(record)
            return True
        except queue.Full:
            return False

    # ------------------------------------------------------------------
    # Boucle de flush interne
    # ------------------------------------------------------------------

    def _flush_loop(self) -> None:
        while not self._stop_event.is_set():
            time.sleep(self._flush_interval)
            self._flush()

    def _flush(self) -> None:
        batch = []
        try:
            while True:
                batch.append(self._queue.get_nowait())
        except queue.Empty:
            pass

        if not batch:
            return

        payload = "\n".join(json.dumps(r, ensure_ascii=False) for r in batch).encode()
        req = urllib.request.Request(
            self._server_url,
            data=payload,
            headers={
                "Content-Type": "application/x-ndjson",
                "X-BEDR-Version": "1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=3):
                pass
        except Exception as exc:
            self._on_flush_error(exc)


# ------------------------------------------------------------------
# Serveur d'ingestion minimaliste (pour le test local)
# ------------------------------------------------------------------

def run_ingestion_server(
    host: str = "0.0.0.0",
    port: int = 8765,
    on_batch: Callable[[list[dict]], None] | None = None,
) -> None:
    """
    Lance un serveur HTTP minimaliste qui reçoit les batches de télémétrie
    et les passe à `on_batch` pour traitement (Brique 2).

    En production, ce serait un endpoint FastAPI/Kafka consumer.
    """
    from http.server import BaseHTTPRequestHandler, HTTPServer

    _callback = on_batch or (lambda batch: print(f"[Server] Received {len(batch)} events"))

    class _Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode()
            batch = [json.loads(line) for line in raw.splitlines() if line.strip()]
            self.send_response(200)
            self.end_headers()
            _callback(batch)

        def log_message(self, fmt, *args):
            pass  # silence les logs HTTP par défaut

    server = HTTPServer((host, port), _Handler)
    print(f"[BEDR] Ingestion server listening on {host}:{port}")
    server.serve_forever()
