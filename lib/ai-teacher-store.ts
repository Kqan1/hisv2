import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from 'uuid';

const STORE_DIR = path.join(process.cwd(), "data", "ai-teacher");

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    matrix?: number[][];
    rows?: number;
    cols?: number;
    timestamp: string | Date;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: Message[];
    deviceModelId?: string;
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

export async function getChats(): Promise<ChatSession[]> {
    await ensureDir();
    try {
        const files = await fs.readdir(STORE_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        const chats: ChatSession[] = [];
        
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

export async function getChat(id: string): Promise<ChatSession | null> {
    await ensureDir();
    try {
        const content = await fs.readFile(path.join(STORE_DIR, `${id}.json`), 'utf-8');
        return JSON.parse(content);
    } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

export async function createChat(title: string, messages: Message[] = [], deviceModelId?: string): Promise<ChatSession> {
    await ensureDir();
    const chat: ChatSession = {
        id: uuidv4(),
        title,
        messages,
        ...(deviceModelId && { deviceModelId }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await fs.writeFile(path.join(STORE_DIR, `${chat.id}.json`), JSON.stringify(chat, null, 2));
    return chat;
}

export async function updateChat(id: string, messages: Message[]): Promise<ChatSession | null> {
    const chat = await getChat(id);
    if (!chat) return null;
    
    chat.messages = messages;
    chat.updatedAt = new Date().toISOString();
    // Maybe update title based on first message? We'll leave it as is.
    
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
