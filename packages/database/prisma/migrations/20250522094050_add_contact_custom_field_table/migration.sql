-- CreateTable
CREATE TABLE "ContactCustomField" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "value" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,

    CONSTRAINT "ContactCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactCustomField_contactId_customFieldId_key" ON "ContactCustomField"("contactId", "customFieldId");

-- AddForeignKey
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
