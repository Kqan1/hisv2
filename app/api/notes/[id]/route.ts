import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Prisma } from '@prisma/client';

type NoteWithMatrix = Prisma.NoteGetPayload<{ include: { pixelMatrix: true } }>;

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
        const note: NoteWithMatrix | null = await db.note.findUnique({
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
        const existing = await db.note.findUnique({
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
            await db.note.update({
                where: { id: noteId },
                data: { title: title || existing.title },
            });
        }
        if (matrix !== undefined) {
            if (!isValidMatrix(matrix)) {
                return NextResponse.json({ error: 'Invalid matrix' }, { status: 400 });
            }
            if (existing.pixelMatrix?.id) {
                await db.pixelMatrix.update({
                    where: { id: existing.pixelMatrix.id },
                    data: { matrix },
                });
            }
        }
        const updated: NoteWithMatrix = await db.note.findUnique({
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

        // Check if note exists
        const note = await db.note.findUnique({
            where: { id: noteId },
        });

        if (!note) {
            return NextResponse.json(
                { error: 'Note not found' },
                { status: 404 }
            );
        }

        // Just delete the note. PixelMatrix will be deleted automatically due to CASCADE if configured,
        // OR we need to delete it manually if it's strictly 1:1 and we want to be clean.
        // The schema says:
        // noteId Int? @unique @map("note_id")
        // note Note? @relation(fields: [noteId], references: [id], onDelete: Cascade)
        // So deleting Note deletes PixelMatrix.
        
        await db.note.delete({
            where: { id: noteId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json(
            { error: 'Failed to delete note' },
            { status: 500 }
        );
    }
}
