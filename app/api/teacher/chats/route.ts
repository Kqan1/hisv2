import { NextResponse } from 'next/server';
import { getChats, createChat } from '@/lib/ai-teacher-store';

export async function GET() {
    try {
        const chats = await getChats();
        return NextResponse.json(chats);
    } catch (error) {
        console.error("Failed to get chats:", error);
        return NextResponse.json({ error: "Failed to get chats" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, messages } = body;
        const chat = await createChat(title || "New Chat", messages || []);
        return NextResponse.json(chat);
    } catch (error) {
        console.error("Failed to create chat:", error);
        return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
    }
}
