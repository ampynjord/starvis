ALTER TABLE "meta"."corporation_fleet_items"
ADD COLUMN "available_for_tactics" BOOLEAN NOT NULL DEFAULT false;

UPDATE "meta"."corporation_fleet_items"
SET "available_for_tactics" = true
WHERE "item_type" = 'ship' AND "corporation_id" IS NOT NULL;
