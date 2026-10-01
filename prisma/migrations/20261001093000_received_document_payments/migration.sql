-- Create supplier document payment flow
CREATE TABLE "ReceivedDocumentPayment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "receivedDocumentId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" "PaymentMethod" NOT NULL,
  "bankAccountId" TEXT,
  "cashRegisterId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReceivedDocumentPayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinancialMovement" ADD COLUMN "receivedDocumentPaymentId" TEXT;
CREATE UNIQUE INDEX "FinancialMovement_receivedDocumentPaymentId_key" ON "FinancialMovement"("receivedDocumentPaymentId");
CREATE INDEX "ReceivedDocumentPayment_companyId_paidAt_idx" ON "ReceivedDocumentPayment"("companyId", "paidAt");
CREATE INDEX "ReceivedDocumentPayment_receivedDocumentId_idx" ON "ReceivedDocumentPayment"("receivedDocumentId");
ALTER TABLE "ReceivedDocumentPayment" ADD CONSTRAINT "ReceivedDocumentPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceivedDocumentPayment" ADD CONSTRAINT "ReceivedDocumentPayment_receivedDocumentId_fkey" FOREIGN KEY ("receivedDocumentId") REFERENCES "ReceivedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceivedDocumentPayment" ADD CONSTRAINT "ReceivedDocumentPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReceivedDocumentPayment" ADD CONSTRAINT "ReceivedDocumentPayment_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_receivedDocumentPaymentId_fkey" FOREIGN KEY ("receivedDocumentPaymentId") REFERENCES "ReceivedDocumentPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
