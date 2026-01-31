import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Prisma } from '@prisma/client';

const SORT_TO_ORDER: Record<string, { [key: string]: 'asc' | 'desc' }> = {
    'title-asc': { title: 'asc' },
    'title-desc': { title: 'desc' },
    'createdAt-asc': { createdAt: 'asc' },
    'createdAt-desc': { createdAt: 'desc' },
    'updatedAt-asc': { updatedAt: 'asc' },
    'updatedAt-desc': { updatedAt: 'desc' },
};

const DEFAULT_SORT = 'createdAt-desc';

const QUERY_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('QUERY_TIMEOUT')), ms)
        ),
    ]);
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const sort = searchParams.get('sort') || DEFAULT_SORT;
        const orderBy = SORT_TO_ORDER[sort] ?? SORT_TO_ORDER[DEFAULT_SORT];

        const notes: Prisma.NotesGetPayload<{ include: { pixelMatrix: true } }>[] = await withTimeout(
            db.notes.findMany({
                include: { pixelMatrix: true },
                orderBy,
            }),
            QUERY_TIMEOUT_MS
        );

        return NextResponse.json(notes);
    } catch (error) {
        const isTimeout =
            error instanceof Error && error.message === 'QUERY_TIMEOUT';
        const isPrismaTimeout =
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: string }).code === 'ETIMEDOUT';

        if (isTimeout || isPrismaTimeout) {
            console.error('Notes fetch timeout:', error);
            return NextResponse.json(
                {
                    error: 'Veritabanı zaman aşımına uğradı. Bağlantıyı kontrol edip tekrar deneyin.',
                },
                { status: 503 }
            );
        }

        console.error('Error fetching notes:', error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Notlar yüklenirken bir hata oluştu.',
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { title, matrix } = body as { title?: string; matrix?: number[][] };

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return NextResponse.json(
                { error: 'Title is required' },
                { status: 400 }
            );
        }

        const rows = 10;
        const cols = 15;
        const initialMatrix =
            Array.isArray(matrix) && matrix.length === rows && matrix.every((row) => Array.isArray(row) && row.length === cols)
                ? matrix
                : Array(rows)
                      .fill(0)
                      .map(() => Array(cols).fill(0));

        const pixelMatrix = await db.pixelMatrix.create({
            data: { matrix: initialMatrix },
        });

        const note = await db.notes.create({
            data: {
                title: title.trim().slice(0, 255),
                pixelMatrixId: pixelMatrix.id,
            },
            include: { pixelMatrix: true },
        });

        return NextResponse.json(note);
    } catch (error) {
        console.error('Error creating note:', error);
        return NextResponse.json(
            { error: 'Failed to create note' },
            { status: 500 }
        );
    }
}
