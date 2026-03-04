-- AlterTable
ALTER TABLE "Estate" ADD COLUMN     "description" TEXT,
ADD COLUMN     "numberOfUnits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "estateId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
