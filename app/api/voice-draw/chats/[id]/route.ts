import { NextResponse } from 'next/server';
import { getChat, updateChat, deleteChat } from '@/lib/voice-draw-store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const chat = await getChat(id);
        if (!chat) {
            return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }
        return NextResponse.json(chat);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch chat' }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const updatedChat = await updateChat(id, body.transcript, body.matrix);
        
        if (!updatedChat) {
            return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }
        
        return NextResponse.json(updatedChat);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const success = await deleteChat(id);
        if (!success) {
            return NextResponse.json({ error: 'Chat not found or failed to delete' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
    }
}
