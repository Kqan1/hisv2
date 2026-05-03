import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from 'uuid';
import type { TranscriptEntry } from '@/hooks/useGeminiLive';

const STORE_DIR = path.join(process.cwd(), "data", "voice-draw");

export interface VoiceDrawSession {
    id: string;
    title: string;
    transcript: TranscriptEntry[];
    matrix: number[][] | null;
    createdAt: string;
    updatedAt: string;
}

async function ensureDir() {
    try {
        await fs.mkdir(STORE_DIR, { recursive: true });
    } catch (err) {
        // ignore if exists
    }
}

export async function getChats(): Promise<VoiceDrawSession[]> {
    await ensureDir();
    try {
        const files = await fs.readdir(STORE_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        const chats: VoiceDrawSession[] = [];
        
        for (const file of jsonFiles) {
            const content = await fs.readFile(path.join(STORE_DIR, file), 'utf-8');
            try {
                const parsed = JSON.parse(content);
                if (!Array.isArray(parsed) && parsed.id) {
                    chats.push(parsed);
                }
            } catch (e) {
                console.error(`Failed to parse ${file}`, e);
            }
        }
        
        return chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err: any) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

export async function getChat(id: string): Promise<VoiceDrawSession | null> {
    await ensureDir();
    try {
        const content = await fs.readFile(path.join(STORE_DIR, `${id}.json`), 'utf-8');
        return JSON.parse(content);
    } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

export async function createChat(title: string, transcript: TranscriptEntry[] = [], matrix: number[][] | null = null): Promise<VoiceDrawSession> {
    await ensureDir();
    const chat: VoiceDrawSession = {
        id: uuidv4(),
        title,
        transcript,
        matrix,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(path.join(STORE_DIR, `${chat.id}.json`), JSON.stringify(chat, null, 2));
    return chat;
}

export async function updateChat(id: string, transcript: TranscriptEntry[], matrix: number[][] | null): Promise<VoiceDrawSession | null> {
    const chat = await getChat(id);
    if (!chat) return null;
    
    chat.transcript = transcript;
    chat.matrix = matrix;
    chat.updatedAt = new Date().toISOString();
    
    // Auto-generate title from first user message if it's currently "New Session"
    if (chat.title === "New Session" && transcript.length > 0) {
        const firstUserMessage = transcript.find(t => t.role === 'user');
        if (firstUserMessage && firstUserMessage.text) {
            const words = firstUserMessage.text.split(' ');
            chat.title = words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');
        }
    }
    
    await fs.writeFile(path.join(STORE_DIR, `${id}.json`), JSON.stringify(chat, null, 2));
    return chat;
}

export async function deleteChat(id: string): Promise<boolean> {
    try {
        await fs.unlink(path.join(STORE_DIR, `${id}.json`));
        return true;
    } catch (e) {
        return false;
    }
}
