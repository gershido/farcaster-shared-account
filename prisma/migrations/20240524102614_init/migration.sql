-- CreateTable
CREATE TABLE "Signer" (
    "id" TEXT NOT NULL,
    "ethAddr" TEXT NOT NULL,
    "eddsaKey" TEXT NOT NULL,
    "fid" TEXT NOT NULL,

    CONSTRAINT "Signer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signer_eddsaKey_key" ON "Signer"("eddsaKey");
