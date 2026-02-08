/*
  Warnings:

  - You are about to drop the column `pixel_matrix_id` on the `frames` table. All the data in the column will be lost.
  - You are about to drop the column `pixel_matrix_id` on the `notes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[frame_id]` on the table `pixel_matrices` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[note_id]` on the table `pixel_matrices` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "frames" DROP CONSTRAINT "frames_pixel_matrix_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_pixel_matrix_id_fkey";

-- DropIndex
DROP INDEX "frames_pixel_matrix_id_idx";

-- AlterTable
ALTER TABLE "frames" DROP COLUMN "pixel_matrix_id";

-- AlterTable
ALTER TABLE "notes" DROP COLUMN "pixel_matrix_id";

-- AlterTable
ALTER TABLE "pixel_matrices" ADD COLUMN     "frame_id" INTEGER,
ADD COLUMN     "note_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "pixel_matrices_frame_id_key" ON "pixel_matrices"("frame_id");

-- CreateIndex
CREATE UNIQUE INDEX "pixel_matrices_note_id_key" ON "pixel_matrices"("note_id");

-- AddForeignKey
ALTER TABLE "pixel_matrices" ADD CONSTRAINT "pixel_matrices_frame_id_fkey" FOREIGN KEY ("frame_id") REFERENCES "frames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pixel_matrices" ADD CONSTRAINT "pixel_matrices_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
