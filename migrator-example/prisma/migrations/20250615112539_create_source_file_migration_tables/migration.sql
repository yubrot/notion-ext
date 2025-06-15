-- CreateTable
CREATE TABLE "SourceFileMigration" (
    "url" TEXT NOT NULL,
    "notionFileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceFileMigration_pkey" PRIMARY KEY ("url")
);

-- CreateTable
CREATE TABLE "SourceFileMigrationError" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceFileMigrationError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceFileMigration_notionFileId_key" ON "SourceFileMigration"("notionFileId");

-- CreateIndex
CREATE INDEX "SourceFileMigrationError_url_idx" ON "SourceFileMigrationError"("url");
