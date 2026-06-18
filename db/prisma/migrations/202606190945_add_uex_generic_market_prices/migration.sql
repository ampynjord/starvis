CREATE TABLE "game"."uex_market_prices" (
  "id" SERIAL NOT NULL,
  "env" VARCHAR(10) NOT NULL DEFAULT 'live',
  "resource" VARCHAR(40) NOT NULL,
  "uex_id" INTEGER NOT NULL,
  "entity_kind" VARCHAR(24) NOT NULL,
  "entity_uex_id" INTEGER,
  "entity_uuid" CHAR(36),
  "entity_name" VARCHAR(255),
  "terminal_uex_id" INTEGER,
  "terminal_name" VARCHAR(255),
  "price_kind" VARCHAR(16) NOT NULL,
  "price" DECIMAL(14,2),
  "price_buy" DECIMAL(14,2),
  "price_sell" DECIMAL(14,2),
  "price_average" DECIMAL(14,2),
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "date_modified" TIMESTAMP(3),
  "raw_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "uex_market_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uex_market_prices_env_resource_uex_id_key" ON "game"."uex_market_prices"("env", "resource", "uex_id");
CREATE INDEX "uex_market_prices_env_entity_kind_idx" ON "game"."uex_market_prices"("env", "entity_kind");
CREATE INDEX "uex_market_prices_entity_uuid_env_idx" ON "game"."uex_market_prices"("entity_uuid", "env");
CREATE INDEX "uex_market_prices_terminal_uex_id_env_idx" ON "game"."uex_market_prices"("terminal_uex_id", "env");
CREATE INDEX "uex_market_prices_price_kind_idx" ON "game"."uex_market_prices"("price_kind");
