-- SukFak 2.0 finance foundation
CREATE TYPE "FinancialMovementType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE', 'BOTH');
CREATE TYPE "AssetType" AS ENUM ('TANGIBLE', 'INTANGIBLE', 'OTHER');

ALTER TYPE "NumberingSeriesType" ADD VALUE IF NOT EXISTS 'RECEIVED_DOCUMENT';

CREATE TABLE "BankAccount" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountNumber" TEXT,
  "bankCode" TEXT,
  "iban" TEXT,
  "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CashRegister" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashRegister_companyId_idx" ON "CashRegister"("companyId");
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "CategoryType" NOT NULL DEFAULT 'BOTH',
  "isTaxDeductible" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId","name");
CREATE INDEX "Category_companyId_type_idx" ON "Category"("companyId","type");
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReceivedDocument" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "supplierName" TEXT NOT NULL,
  "supplierIco" TEXT,
  "supplierDic" TEXT,
  "documentNumber" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "amount" DECIMAL(15,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CZK',
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "categoryId" TEXT,
  "note" TEXT,
  "attachmentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReceivedDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReceivedDocument_companyId_documentNumber_key" ON "ReceivedDocument"("companyId","documentNumber");
CREATE INDEX "ReceivedDocument_companyId_issueDate_idx" ON "ReceivedDocument"("companyId","issueDate");
CREATE INDEX "ReceivedDocument_companyId_dueDate_idx" ON "ReceivedDocument"("companyId","dueDate");
ALTER TABLE "ReceivedDocument" ADD CONSTRAINT "ReceivedDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceivedDocument" ADD CONSTRAINT "ReceivedDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FinancialMovement" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "FinancialMovementType" NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" "PaymentMethod" NOT NULL,
  "description" TEXT,
  "categoryId" TEXT,
  "bankAccountId" TEXT,
  "cashRegisterId" TEXT,
  "invoiceId" TEXT,
  "receivedDocumentId" TEXT,
  "paymentId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialMovement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialMovement_paymentId_key" ON "FinancialMovement"("paymentId");
CREATE INDEX "FinancialMovement_companyId_date_idx" ON "FinancialMovement"("companyId","date");
CREATE INDEX "FinancialMovement_companyId_type_date_idx" ON "FinancialMovement"("companyId","type","date");
CREATE INDEX "FinancialMovement_companyId_categoryId_idx" ON "FinancialMovement"("companyId","categoryId");
CREATE INDEX "FinancialMovement_companyId_bankAccountId_date_idx" ON "FinancialMovement"("companyId","bankAccountId","date");
CREATE INDEX "FinancialMovement_companyId_cashRegisterId_date_idx" ON "FinancialMovement"("companyId","cashRegisterId","date");
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_receivedDocumentId_fkey" FOREIGN KEY ("receivedDocumentId") REFERENCES "ReceivedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "acquiredAt" TIMESTAMP(3) NOT NULL,
  "purchasePrice" DECIMAL(15,2) NOT NULL,
  "type" "AssetType" NOT NULL DEFAULT 'TANGIBLE',
  "placedInService" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Asset_companyId_acquiredAt_idx" ON "Asset"("companyId","acquiredAt");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
