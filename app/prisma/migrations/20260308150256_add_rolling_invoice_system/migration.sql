/*
  Warnings:

  - The primary key for the `CommunicationLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `estateId` to the `CommunicationLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recipient` to the `CommunicationLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CommunicationLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `estateId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `estateId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CommunicationLog" DROP CONSTRAINT "CommunicationLog_pkey",
ADD COLUMN     "communicationType" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estateId" INTEGER NOT NULL,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "invoiceId" INTEGER,
ADD COLUMN     "lastCommunicationDate" TIMESTAMP(3),
ADD COLUMN     "recipient" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'SENT',
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "template" TEXT,
ADD COLUMN     "templateVariables" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "CommunicationLog_id_seq";

-- AlterTable
ALTER TABLE "Estate" ADD COLUMN     "communicationFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "defaultMonthlyCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceBackdateToMoveIn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateFeeCompounding" TEXT NOT NULL DEFAULT 'SIMPLE',
ADD COLUMN     "lateFeeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateFeeKickInAfterDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "lateFeeMaxCap" DOUBLE PRECISION,
ADD COLUMN     "lateFeeType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "lateFeeValue" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "sendRemindersBeforeDue" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estateId" INTEGER NOT NULL,
ADD COLUMN     "lastPaymentDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "totalOutstanding" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "estateId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "InvoiceMonth" (
    "id" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "month" CHAR(7) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "lateFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountRemaining" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "lateFeeId" TEXT,
    "lateFeeAppliedDate" TIMESTAMP(3),
    "lateFeeAppliedByType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateFee" (
    "id" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "estateId" INTEGER NOT NULL,
    "monthAffected" CHAR(7) NOT NULL,
    "daysOverdue" INTEGER NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "feeType" TEXT NOT NULL,
    "feeValue" DOUBLE PRECISION NOT NULL,
    "calculatedAmount" DECIMAL(10,2) NOT NULL,
    "appliedToBalance" DECIMAL(10,2) NOT NULL,
    "compoundingMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "waiveDate" TIMESTAMP(3),
    "waivedReason" TEXT,

    CONSTRAINT "LateFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "month" CHAR(7) NOT NULL,
    "allocatedAmount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceMonth_lateFeeId_key" ON "InvoiceMonth"("lateFeeId");

-- CreateIndex
CREATE INDEX "InvoiceMonth_invoiceId_idx" ON "InvoiceMonth"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceMonth_month_idx" ON "InvoiceMonth"("month");

-- CreateIndex
CREATE INDEX "LateFee_invoiceId_idx" ON "LateFee"("invoiceId");

-- CreateIndex
CREATE INDEX "LateFee_monthAffected_idx" ON "LateFee"("monthAffected");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_month_idx" ON "PaymentAllocation"("month");

-- CreateIndex
CREATE INDEX "CommunicationLog_residentId_idx" ON "CommunicationLog"("residentId");

-- CreateIndex
CREATE INDEX "CommunicationLog_invoiceId_idx" ON "CommunicationLog"("invoiceId");

-- CreateIndex
CREATE INDEX "CommunicationLog_status_idx" ON "CommunicationLog"("status");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceMonth" ADD CONSTRAINT "InvoiceMonth_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceMonth" ADD CONSTRAINT "InvoiceMonth_lateFeeId_fkey" FOREIGN KEY ("lateFeeId") REFERENCES "LateFee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFee" ADD CONSTRAINT "LateFee_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFee" ADD CONSTRAINT "LateFee_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
