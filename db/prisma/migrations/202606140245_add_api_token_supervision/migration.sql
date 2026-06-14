CREATE TABLE "meta"."api_tokens" (
    "id" SERIAL NOT NULL,
    "jti" VARCHAR(64) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "user_id" INTEGER NOT NULL,
    "role_snapshot" "meta"."UserRole" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "last_used_ip" VARCHAR(80),
    "last_user_agent" VARCHAR(160),
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_tokens_jti_key" ON "meta"."api_tokens"("jti");
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "meta"."api_tokens"("token_hash");
CREATE INDEX "api_tokens_user_id_idx" ON "meta"."api_tokens"("user_id");
CREATE INDEX "api_tokens_expires_at_idx" ON "meta"."api_tokens"("expires_at");
CREATE INDEX "api_tokens_revoked_at_idx" ON "meta"."api_tokens"("revoked_at");
CREATE INDEX "api_tokens_last_used_at_idx" ON "meta"."api_tokens"("last_used_at");

ALTER TABLE "meta"."api_tokens"
ADD CONSTRAINT "api_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "meta"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
