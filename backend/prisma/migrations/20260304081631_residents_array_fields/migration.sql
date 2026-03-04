/*
  Warnings:

  - You are about to drop the column `email` on the `Resident` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Resident` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Resident" DROP CONSTRAINT "Resident_unitId_fkey";

-- DropIndex
DROP INDEX "Resident_email_key";

-- AlterTable
ALTER TABLE "Resident" DROP COLUMN "email",
DROP COLUMN "phone",
ADD COLUMN     "emails" TEXT[],
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phones" TEXT[];

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
