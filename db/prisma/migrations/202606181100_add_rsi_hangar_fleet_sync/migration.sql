-- Add RSI hangar sync metadata to fleet declarations.
ALTER TABLE "meta"."corporation_fleet_items"
  ADD COLUMN "source" VARCHAR(40),
  ADD COLUMN "source_external_id" VARCHAR(160),
  ADD COLUMN "source_label" VARCHAR(255),
  ADD COLUMN "source_payload" JSONB,
  ADD COLUMN "source_synced_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "corporation_fleet_items_added_by_id_source_source_external_id_key"
  ON "meta"."corporation_fleet_items"("added_by_id", "source", "source_external_id");

CREATE INDEX "corporation_fleet_items_source_source_synced_at_idx"
  ON "meta"."corporation_fleet_items"("source", "source_synced_at");
