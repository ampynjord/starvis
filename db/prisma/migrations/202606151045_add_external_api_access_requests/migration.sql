CREATE TABLE "meta"."external_api_access_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "motivation" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_api_access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_api_access_requests_user_id_idx" ON "meta"."external_api_access_requests"("user_id");
CREATE INDEX "external_api_access_requests_status_created_at_idx" ON "meta"."external_api_access_requests"("status", "created_at");
CREATE INDEX "external_api_access_requests_reviewed_by_id_idx" ON "meta"."external_api_access_requests"("reviewed_by_id");

ALTER TABLE "meta"."external_api_access_requests"
ADD CONSTRAINT "external_api_access_requests_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "meta"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meta"."external_api_access_requests"
ADD CONSTRAINT "external_api_access_requests_reviewed_by_id_fkey"
FOREIGN KEY ("reviewed_by_id") REFERENCES "meta"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
