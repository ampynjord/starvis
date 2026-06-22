-- Canonical source correlation for cross-source identity resolution.
-- Keeps existing P4K/RSI/UEX primary keys stable while allowing Starvis to
-- expose one deduplicated entity with explicit source links.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "game"."canonical_entities" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "env"               VARCHAR(10)  NOT NULL DEFAULT 'live',
  "domain"            VARCHAR(40)  NOT NULL,
  "canonical_key"     VARCHAR(255) NOT NULL,
  "name"              VARCHAR(255) NOT NULL,
  "primary_source"    VARCHAR(30),
  "primary_source_id" VARCHAR(160),
  "confidence"        VARCHAR(30)  NOT NULL DEFAULT 'computed',
  "metadata"          JSONB,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "canonical_entities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "canonical_entities_env_domain_canonical_key_key"
  ON "game"."canonical_entities" ("env", "domain", "canonical_key");

CREATE INDEX IF NOT EXISTS "canonical_entities_domain_env_idx"
  ON "game"."canonical_entities" ("domain", "env");

CREATE INDEX IF NOT EXISTS "canonical_entities_primary_source_primary_source_id_idx"
  ON "game"."canonical_entities" ("primary_source", "primary_source_id");

CREATE TABLE IF NOT EXISTS "game"."canonical_entity_links" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "canonical_id"  UUID         NOT NULL,
  "env"           VARCHAR(10)  NOT NULL DEFAULT 'live',
  "domain"        VARCHAR(40)  NOT NULL,
  "source"        VARCHAR(30)  NOT NULL,
  "source_table"  VARCHAR(120) NOT NULL,
  "source_id"     VARCHAR(160),
  "source_uuid"   VARCHAR(80),
  "source_name"   VARCHAR(255),
  "match_method"  VARCHAR(40)  NOT NULL DEFAULT 'computed',
  "match_score"   INTEGER      NOT NULL DEFAULT 0,
  "is_primary"    BOOLEAN      NOT NULL DEFAULT false,
  "metadata"      JSONB,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "canonical_entity_links_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "game"."canonical_entity_links"
  ADD CONSTRAINT "canonical_entity_links_canonical_id_fkey"
  FOREIGN KEY ("canonical_id")
  REFERENCES "game"."canonical_entities"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "canonical_entity_links_source_unique_idx"
  ON "game"."canonical_entity_links" ("env", "domain", "source", "source_table", "source_id", "source_uuid");

CREATE INDEX IF NOT EXISTS "canonical_entity_links_canonical_id_idx"
  ON "game"."canonical_entity_links" ("canonical_id");

CREATE INDEX IF NOT EXISTS "canonical_entity_links_source_source_table_idx"
  ON "game"."canonical_entity_links" ("source", "source_table");

CREATE INDEX IF NOT EXISTS "canonical_entity_links_source_uuid_idx"
  ON "game"."canonical_entity_links" ("source_uuid");
