-- Le taux de remplissage de chaque colonne, à chaque extraction.
--
-- Le garde-fou existant compare des *nombres de lignes* : une extraction qui
-- perdrait la moitié des vaisseaux est rejetée. Il ne voit rien, en revanche,
-- quand une colonne se vide en gardant ses lignes.
--
-- C'est pourtant le mode d'échec le plus courant ici. Deux exemples trouvés le
-- 29 juillet 2026 : la carte des franchises lisait `name` là où le jeu écrit
-- `localizedName`, et l'extraction des coordonnées cherchait un champ `position`
-- qui n'existe pas. Dans les deux cas l'extraction réussissait, le compte de
-- lignes était juste, et la colonne était vide depuis on ne sait quand.
--
-- Une mise à jour du jeu et une régression d'extraction se ressemblent : les
-- deux font bouger des chiffres. Les distinguer demande de comparer, et donc
-- d'avoir gardé la mesure précédente.

CREATE TABLE "meta"."field_coverage" (
  "id"             SERIAL       NOT NULL,
  "extraction_id"  INTEGER,
  "env"            VARCHAR(10)  NOT NULL DEFAULT 'live',
  "table_name"     VARCHAR(120) NOT NULL,
  "column_name"    VARCHAR(120) NOT NULL,
  "row_count"      INTEGER      NOT NULL,
  "non_null_count" INTEGER      NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "field_coverage_pkey" PRIMARY KEY ("id")
);

-- « Le relevé précédent pour cette colonne » est la seule question posée.
CREATE INDEX "field_coverage_lookup_idx"
  ON "meta"."field_coverage" ("env", "table_name", "column_name", "id" DESC);

CREATE INDEX "field_coverage_extraction_idx" ON "meta"."field_coverage" ("extraction_id");
