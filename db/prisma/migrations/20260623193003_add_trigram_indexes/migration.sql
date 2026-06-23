-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "commodities_name_idx" ON "game"."commodities" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "components_name_idx" ON "game"."components" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "crafting_recipes_name_idx" ON "game"."crafting_recipes" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "items_name_idx" ON "game"."items" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "missions_title_idx" ON "game"."missions" USING GIN ("title" gin_trgm_ops);
