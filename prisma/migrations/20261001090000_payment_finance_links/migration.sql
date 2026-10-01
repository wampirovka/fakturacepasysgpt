ALTER TABLE "Payment" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cashRegisterId" TEXT;
CREATE INDEX "Payment_bankAccountId_idx" ON "Payment"("bankAccountId");
CREATE INDEX "Payment_cashRegisterId_idx" ON "Payment"("cashRegisterId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;