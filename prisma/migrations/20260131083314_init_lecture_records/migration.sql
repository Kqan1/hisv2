/*
  Warnings:

  - You are about to drop the `Notes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PixelMatrix` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Notes" DROP CONSTRAINT "Notes_pixelMatrixId_fkey";

-- DropTable
DROP TABLE "Notes";

-- DropTable
DROP TABLE "PixelMatrix";

-- CreateTable
CREATE TABLE "lecture_records" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "audio_path" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lecture_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frames" (
    "id" SERIAL NOT NULL,
    "lecture_record_id" INTEGER NOT NULL,
    "pixel_matrix_id" INTEGER NOT NULL,
    "delta_time" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pixel_matrices" (
    "id" SERIAL NOT NULL,
    "matrix" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pixel_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "pixel_matrix_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "frames_lecture_record_id_delta_time_idx" ON "frames"("lecture_record_id", "delta_time");

-- CreateIndex
CREATE INDEX "frames_pixel_matrix_id_idx" ON "frames"("pixel_matrix_id");

-- AddForeignKey
ALTER TABLE "frames" ADD CONSTRAINT "frames_lecture_record_id_fkey" FOREIGN KEY ("lecture_record_id") REFERENCES "lecture_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frames" ADD CONSTRAINT "frames_pixel_matrix_id_fkey" FOREIGN KEY ("pixel_matrix_id") REFERENCES "pixel_matrices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_pixel_matrix_id_fkey" FOREIGN KEY ("pixel_matrix_id") REFERENCES "pixel_matrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
