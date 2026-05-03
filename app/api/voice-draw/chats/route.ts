import { NextResponse } from 'next/server';
import { getChats, createChat } from '@/lib/voice-draw-store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const chats = await getChats();
        return NextResponse.json(chats);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch chats' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { title = "New Session", transcript = [], matrix = null } = await request.json().catch(() => ({}));
        const chat = await createChat(title, transcript, matrix);
        return NextResponse.json(chat);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
    }
}
