-- CreateTable
CREATE TABLE "PixelMatrix" (
    "id" SERIAL NOT NULL,
    "matrix" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixelMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notes" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "pixelMatrixId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Notes" ADD CONSTRAINT "Notes_pixelMatrixId_fkey" FOREIGN KEY ("pixelMatrixId") REFERENCES "PixelMatrix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
