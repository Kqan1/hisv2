import { NextRequest, NextResponse } from 'next/server';
import { getNotes, createNote } from '@/lib/notes-store';
import { DEVICE_MODELS } from '@/lib/config';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '10');

        const result = await getNotes(page, pageSize);

        return NextResponse.json(result);
    } catch (error) {
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
        const { title, matrices, matrix, deviceModelId } = body as { title?: string; matrices?: number[][][]; matrix?: number[][]; deviceModelId?: string };

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return NextResponse.json(
                { error: 'Title is required' },
                { status: 400 }
            );
        }

        const modelConfig = DEVICE_MODELS.find(m => m.id === deviceModelId) || DEVICE_MODELS[0];
        
        // Support both single 'matrix' and multiple 'matrices'
        let finalMatrices: number[][][] = [];
        if (matrices && Array.isArray(matrices)) {
            finalMatrices = matrices;
        } else if (matrix) {
            finalMatrices = [matrix];
        } else {
            // Default empty matrix
            finalMatrices = [
                Array(modelConfig.rows)
                    .fill(0)
                    .map(() => Array(modelConfig.cols).fill(0))
            ];
        }

        const note = await createNote({
            title: title.trim().slice(0, 255),
            deviceModelId: deviceModelId || "amc-1",
            matrices: finalMatrices,
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
