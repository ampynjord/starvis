CREATE TABLE "meta"."user_request_history" (
  "id" SERIAL NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" VARCHAR(12) NOT NULL,
  "path" VARCHAR(600) NOT NULL,
  "status_code" INTEGER NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "is_external_api" BOOLEAN NOT NULL DEFAULT false,
  "auth_method" VARCHAR(32) NOT NULL,
  "client_type" VARCHAR(40) NOT NULL,
  "internal_client" VARCHAR(80),
  "api_token_id" INTEGER,
  "api_token_name" VARCHAR(120),
  "user_id" INTEGER,
  "username" VARCHAR(80),
  "role" "meta"."UserRole",
  "ip" VARCHAR(80),
  "user_agent" VARCHAR(180),

  CONSTRAINT "user_request_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_request_history_timestamp_idx" ON "meta"."user_request_history"("timestamp");
CREATE INDEX "user_request_history_user_id_timestamp_idx" ON "meta"."user_request_history"("user_id", "timestamp");
CREATE INDEX "user_request_history_role_timestamp_idx" ON "meta"."user_request_history"("role", "timestamp");
CREATE INDEX "user_request_history_is_external_api_timestamp_idx" ON "meta"."user_request_history"("is_external_api", "timestamp");
CREATE INDEX "user_request_history_client_type_timestamp_idx" ON "meta"."user_request_history"("client_type", "timestamp");

ALTER TABLE "meta"."user_request_history"
  ADD CONSTRAINT "user_request_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "meta"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
