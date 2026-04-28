import { NextResponse } from 'next/server';
import { getChat, deleteChat, updateChat } from '@/lib/ai-teacher-store';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const chat = await getChat(id);
        if (!chat) {
            return NextResponse.json({ error: "Chat not found" }, { status: 404 });
        }
        return NextResponse.json(chat);
    } catch (error) {
        console.error("Failed to get chat:", error);
        return NextResponse.json({ error: "Failed to get chat" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const success = await deleteChat(id);
        if (!success) {
            return NextResponse.json({ error: "Chat not found or could not be deleted" }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete chat:", error);
        return NextResponse.json({ error: "Failed to delete chat" }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await request.json();
        const { messages } = body;
        const chat = await updateChat(id, messages);
        if (!chat) {
            return NextResponse.json({ error: "Chat not found" }, { status: 404 });
        }
        return NextResponse.json(chat);
    } catch (error) {
        console.error("Failed to update chat:", error);
        return NextResponse.json({ error: "Failed to update chat" }, { status: 500 });
    }
}
