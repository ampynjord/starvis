-- Ce qu'on peut faire à un endroit.
--
-- `StarMapObject.amenities` référence un catalogue, `StarMapAmenityTypeEntry` :
-- hangar S/M/L/XL, plateforme d'atterrissage, achat d'armure ou d'armes, cour de
-- restauration, ascenseur de fret, services véhicule, clinique, raffinerie.
-- Vingt-cinq services, 722 rattachements sur 92 lieux. Rien ne les extrayait.
--
-- Deux tables plutôt qu'une colonne JSON sur `locations` : un service est une
-- entité à part entière — il a un libellé, une icône, et on veut pouvoir
-- demander « quelles stations ont un hangar XL » sans fouiller du JSON.

CREATE TABLE "game"."location_amenity_types" (
  "id"           VARCHAR(36)  NOT NULL,
  "env"          VARCHAR(10)  NOT NULL DEFAULT 'live',
  "name"         VARCHAR(120) NOT NULL,
  "display_name" VARCHAR(160),
  "loc_key"      VARCHAR(160),
  "icon_path"    VARCHAR(255),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "location_amenity_types_pkey" PRIMARY KEY ("id", "env")
);

CREATE TABLE "game"."location_amenities" (
  "env"           VARCHAR(10) NOT NULL DEFAULT 'live',
  "location_uuid" CHAR(36)    NOT NULL,
  "amenity_id"    VARCHAR(36) NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "location_amenities_pkey" PRIMARY KEY ("env", "location_uuid", "amenity_id")
);

-- « Quelles commodités a ce lieu » et « quels lieux ont ce service » sont les
-- deux questions posées ; chacune a son index.
CREATE INDEX "location_amenities_location_idx" ON "game"."location_amenities" ("env", "location_uuid");
CREATE INDEX "location_amenities_amenity_idx" ON "game"."location_amenities" ("env", "amenity_id");

ALTER TABLE "game"."location_amenities"
  ADD CONSTRAINT "location_amenities_location_uuid_env_fkey"
  FOREIGN KEY ("location_uuid", "env") REFERENCES "game"."locations"("uuid", "env")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "game"."location_amenities"
  ADD CONSTRAINT "location_amenities_amenity_id_env_fkey"
  FOREIGN KEY ("amenity_id", "env") REFERENCES "game"."location_amenity_types"("id", "env")
  ON DELETE CASCADE ON UPDATE CASCADE;
