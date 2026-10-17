-- Les jetons API ne dépendent plus des comptes.
--
-- Un jeton appartenait à un utilisateur : `user_id` obligatoire, supprimé en
-- cascade avec lui. Supprimer les comptes aurait donc effacé les jetons des
-- intégrations tierces, que la renaissance promet de garder (docs/renaissance.md,
-- décisions D1 et D2).
--
-- Le jeton porte désormais lui-même le nom de son propriétaire. `user_id` reste,
-- nullable, le temps de vérifier les jetons existants contre une copie de la
-- production ; une migration ultérieure le supprimera avec les comptes.
--
-- Migration additive : aucune ligne n'est supprimée, aucun jeton n'est invalidé.

ALTER TABLE "meta"."api_tokens" ADD COLUMN "owner_name" VARCHAR(120);

UPDATE "meta"."api_tokens" AS t
SET "owner_name" = u."username"
FROM "meta"."users" AS u
WHERE t."user_id" = u."id";

UPDATE "meta"."api_tokens" SET "owner_name" = "name" WHERE "owner_name" IS NULL;

ALTER TABLE "meta"."api_tokens" ALTER COLUMN "owner_name" SET NOT NULL;

ALTER TABLE "meta"."api_tokens" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "meta"."api_tokens" DROP CONSTRAINT "api_tokens_user_id_fkey";

ALTER TABLE "meta"."api_tokens"
ADD CONSTRAINT "api_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "meta"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
