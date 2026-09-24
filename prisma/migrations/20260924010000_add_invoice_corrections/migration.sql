-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "correctiveOfId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_companyId_correctiveOfId_idx" ON "Invoice"("companyId", "correctiveOfId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctiveOfId_fkey" FOREIGN KEY ("correctiveOfId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
