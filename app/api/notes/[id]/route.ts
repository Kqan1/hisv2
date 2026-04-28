import { NextRequest, NextResponse } from 'next/server';
import { getNoteById, updateNote, deleteNote } from '@/lib/notes-store';
import { DEVICE_MODELS } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const note = await getNoteById(id);
        if (!note) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }
        return NextResponse.json(note);
    } catch (error) {
        console.error('Error fetching note:', error);
        return NextResponse.json({ error: 'Failed to fetch note' }, { status: 500 });
    }
}

function isValidMatrix(matrix: unknown, rows: number, cols: number): matrix is number[][] {
    return (
        Array.isArray(matrix) &&
        matrix.length === rows &&
        matrix.every((row) => Array.isArray(row) && row.length === cols)
    );
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const existing = await getNoteById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }
        const body = await request.json().catch(() => ({}));
        const title = typeof body.title === 'string' ? body.title.trim().slice(0, 255) : undefined;
        const pages = body.pages; // Expecting an array of NotePage or just matrices

        const updates: any = {};
        if (title !== undefined) {
            updates.title = title || existing.title;
        }
        if (pages !== undefined && Array.isArray(pages)) {
            // Map to NotePage structure if needed
            updates.pages = pages.map((p: any) => ({
                id: p.id || uuidv4(),
                matrix: p.matrix,
                createdAt: p.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }));
        }

        const updated = await updateNote(id, updates);
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
        const success = await deleteNote(id);
        if (!success) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }
}
