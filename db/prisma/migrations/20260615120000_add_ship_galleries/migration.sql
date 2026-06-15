CREATE TABLE IF NOT EXISTS "rsi"."ship_galleries" (
  "id" SERIAL PRIMARY KEY,
  "ship_matrix_id" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "thumbnail_url" TEXT,
  "title" VARCHAR(255),
  "kind" VARCHAR(50) NOT NULL DEFAULT 'official-gallery',
  "position" INTEGER NOT NULL DEFAULT 0,
  "raw_json" JSONB,
  "synced_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "ship_galleries_ship_matrix_id_fkey"
    FOREIGN KEY ("ship_matrix_id") REFERENCES "rsi"."ship_matrix"("id") ON DELETE CASCADE,
  CONSTRAINT "ship_galleries_ship_matrix_id_url_key" UNIQUE ("ship_matrix_id", "url")
);

CREATE INDEX IF NOT EXISTS "ship_galleries_ship_matrix_id_idx"
  ON "rsi"."ship_galleries"("ship_matrix_id");
