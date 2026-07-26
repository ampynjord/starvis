-- DropForeignKey
ALTER TABLE "meta"."corporation_fleet_items" DROP CONSTRAINT "corporation_fleet_items_added_by_id_fkey";

-- DropForeignKey
ALTER TABLE "meta"."corporation_fleet_items" DROP CONSTRAINT "corporation_fleet_items_corporation_id_fkey";

-- DropForeignKey
ALTER TABLE "meta"."corporation_memberships" DROP CONSTRAINT "corporation_memberships_corporation_id_fkey";

-- DropForeignKey
ALTER TABLE "meta"."corporation_memberships" DROP CONSTRAINT "corporation_memberships_user_id_fkey";

-- DropTable
DROP TABLE "meta"."corporation_fleet_items";

-- DropTable
DROP TABLE "meta"."corporation_memberships";

-- DropTable
DROP TABLE "meta"."corporations";

-- DropEnum
DROP TYPE "meta"."CorporationMembershipRole";

-- DropEnum
DROP TYPE "meta"."CorporationMembershipStatus";

-- DropEnum
DROP TYPE "meta"."FleetItemType";

