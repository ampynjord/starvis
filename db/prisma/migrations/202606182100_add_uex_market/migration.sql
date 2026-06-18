-- UEX market data (external, crowd-sourced live prices).
-- The in-game economy (buy/rent prices, modern dealer locations) is
-- server-authoritative and absent from the P4K, so these tables hold the
-- canonical pricing surfaced by the API/IHM. Vehicles map to game.ships via a
-- byte-reordered Star Citizen UUID.

CREATE TABLE IF NOT EXISTS "game"."uex_terminals" (
  "id"            SERIAL       NOT NULL,
  "env"           VARCHAR(10)  NOT NULL DEFAULT 'live',
  "uex_id"        INTEGER      NOT NULL,
  "type"          VARCHAR(40)  NOT NULL,
  "name"          VARCHAR(255) NOT NULL,
  "nickname"      VARCHAR(255),
  "code"          VARCHAR(40),
  "star_system"   VARCHAR(100),
  "planet"        VARCHAR(100),
  "orbit"         VARCHAR(100),
  "moon"          VARCHAR(100),
  "city"          VARCHAR(100),
  "space_station" VARCHAR(150),
  "outpost"       VARCHAR(150),
  "company_name"  VARCHAR(150),
  "is_available"  BOOLEAN      NOT NULL DEFAULT true,
  "game_version"  VARCHAR(20),
  "screenshot"    VARCHAR(500),
  "date_modified" TIMESTAMP(3),
  "raw_json"      JSONB,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "uex_terminals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uex_terminals_uex_id_env_key" ON "game"."uex_terminals" ("uex_id", "env");
CREATE INDEX IF NOT EXISTS "uex_terminals_type_env_idx" ON "game"."uex_terminals" ("type", "env");
CREATE INDEX IF NOT EXISTS "uex_terminals_env_idx" ON "game"."uex_terminals" ("env");

CREATE TABLE IF NOT EXISTS "game"."uex_vehicle_prices" (
  "id"              SERIAL       NOT NULL,
  "env"             VARCHAR(10)  NOT NULL DEFAULT 'live',
  "uex_id"          INTEGER      NOT NULL,
  "price_kind"      VARCHAR(10)  NOT NULL,
  "uex_vehicle_id"  INTEGER      NOT NULL,
  "ship_uuid"       CHAR(36),
  "vehicle_name"    VARCHAR(255),
  "terminal_uex_id" INTEGER      NOT NULL,
  "price"           DECIMAL(14, 2),
  "price_min"       DECIMAL(14, 2),
  "price_min_week"  DECIMAL(14, 2),
  "date_modified"   TIMESTAMP(3),
  "raw_json"        JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "uex_vehicle_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uex_vehicle_prices_uex_id_price_kind_env_key" ON "game"."uex_vehicle_prices" ("uex_id", "price_kind", "env");
CREATE INDEX IF NOT EXISTS "uex_vehicle_prices_ship_uuid_env_idx" ON "game"."uex_vehicle_prices" ("ship_uuid", "env");
CREATE INDEX IF NOT EXISTS "uex_vehicle_prices_uex_vehicle_id_env_idx" ON "game"."uex_vehicle_prices" ("uex_vehicle_id", "env");
CREATE INDEX IF NOT EXISTS "uex_vehicle_prices_terminal_uex_id_env_idx" ON "game"."uex_vehicle_prices" ("terminal_uex_id", "env");
CREATE INDEX IF NOT EXISTS "uex_vehicle_prices_price_kind_idx" ON "game"."uex_vehicle_prices" ("price_kind");
CREATE INDEX IF NOT EXISTS "uex_vehicle_prices_env_idx" ON "game"."uex_vehicle_prices" ("env");
