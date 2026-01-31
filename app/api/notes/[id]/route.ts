import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Prisma } from '@prisma/client';

type NoteWithMatrix = Prisma.NotesGetPayload<{ include: { pixelMatrix: true } }>;

function parseId(params: Promise<{ id: string }>): Promise<number | null> {
    return params.then(({ id }) => {
        const n = parseInt(id, 10);
        return Number.isNaN(n) ? null : n;
    });
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const noteId = await parseId(params);
        if (noteId == null) {
            return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
        }
        const note: NoteWithMatrix | null = await db.notes.findUnique({
            where: { id: noteId },
            include: { pixelMatrix: true },
        });
        if (!note) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }
        return NextResponse.json(note);
    } catch (error) {
        console.error('Error fetching note:', error);
        return NextResponse.json({ error: 'Failed to fetch note' }, { status: 500 });
    }
}

const ROWS = 10;
const COLS = 15;

function isValidMatrix(matrix: unknown): matrix is number[][] {
    return (
        Array.isArray(matrix) &&
        matrix.length === ROWS &&
        matrix.every((row) => Array.isArray(row) && row.length === COLS)
    );
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const noteId = await parseId(params);
        if (noteId == null) {
            return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
        }
        const existing = await db.notes.findUnique({
            where: { id: noteId },
            include: { pixelMatrix: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }
        const body = await request.json().catch(() => ({}));
        const title = typeof body.title === 'string' ? body.title.trim().slice(0, 255) : undefined;
        const matrix = body.matrix;
        if (title !== undefined) {
            await db.notes.update({
                where: { id: noteId },
                data: { title: title || existing.title },
            });
        }
        if (matrix !== undefined) {
            if (!isValidMatrix(matrix)) {
                return NextResponse.json({ error: 'Invalid matrix' }, { status: 400 });
            }
            await db.pixelMatrix.update({
                where: { id: existing.pixelMatrixId },
                data: { matrix },
            });
        }
        const updated: NoteWithMatrix = await db.notes.findUnique({
            where: { id: noteId },
            include: { pixelMatrix: true },
        }) as NoteWithMatrix;
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error updating note:', error);
        return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const noteId = parseInt(id);

        if (isNaN(noteId)) {
            return NextResponse.json(
                { error: 'Invalid note ID' },
                { status: 400 }
            );
        }

        // Önce notu bul ve pixelMatrixId'yi al
        const note = await db.notes.findUnique({
            where: { id: noteId },
            select: { pixelMatrixId: true },
        });

        if (!note) {
            return NextResponse.json(
                { error: 'Note not found' },
                { status: 404 }
            );
        }

        // Notu sil
        await db.notes.delete({
            where: { id: noteId },
        });

        // Eğer bu pixelMatrix başka bir not tarafından kullanılmıyorsa, onu da sil
        const otherNotesUsingMatrix = await db.notes.findFirst({
            where: {
                pixelMatrixId: note.pixelMatrixId,
                id: { not: noteId },
            },
        });

        if (!otherNotesUsingMatrix) {
            await db.pixelMatrix.delete({
                where: { id: note.pixelMatrixId },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json(
            { error: 'Failed to delete note' },
            { status: 500 }
        );
    }
}
