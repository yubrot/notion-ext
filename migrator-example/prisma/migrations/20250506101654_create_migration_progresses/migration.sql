-- CreateTable
CREATE TABLE "NotionPage" (
    "pageId" TEXT NOT NULL,
    "parentPageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionPage_pkey" PRIMARY KEY ("pageId")
);

-- CreateTable
CREATE TABLE "SourcePageMigration" (
    "url" TEXT NOT NULL,
    "notionPageId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3),
    "freezedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcePageMigration_pkey" PRIMARY KEY ("url")
);

-- CreateTable
CREATE TABLE "SourcePageMigrationError" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcePageMigrationError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotionPage_parentPageId_name_key" ON "NotionPage"("parentPageId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePageMigration_notionPageId_key" ON "SourcePageMigration"("notionPageId");

-- CreateIndex
CREATE INDEX "SourcePageMigrationError_url_idx" ON "SourcePageMigrationError"("url");
