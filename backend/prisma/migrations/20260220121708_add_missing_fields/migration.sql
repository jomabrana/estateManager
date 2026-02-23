/*
  Warnings:

  - A unique constraint covering the columns `[referenceNo]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[residentId,billingMonth,billingYear]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `billingMonth` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingYear` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `referenceNo` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Resident_phone_key";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billingMonth" INTEGER NOT NULL,
ADD COLUMN     "billingYear" INTEGER NOT NULL,
ADD COLUMN     "daysOverdue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referenceNo" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'admin';

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_referenceNo_key" ON "Invoice"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_residentId_billingMonth_billingYear_key" ON "Invoice"("residentId", "billingMonth", "billingYear");
