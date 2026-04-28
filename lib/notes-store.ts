import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const STORE_DIR = path.join(process.cwd(), "data", "notes");

export type NotePage = {
    id: string;
    matrix: number[][];
    createdAt: string;
    updatedAt: string;
};

export type NoteWithMatrix = {
    id: string;
    title: string;
    deviceModelId: string;
    createdAt: string;
    updatedAt: string;
    pages: NotePage[];
};

async function ensureDir() {
    try {
        await fs.mkdir(STORE_DIR, { recursive: true });
    } catch (err) {
        // ignore if exists
    }
}

export async function getNotes(page: number = 1, pageSize: number = 10) {
    await ensureDir();
    const files = await fs.readdir(STORE_DIR);
    const allNotes: NoteWithMatrix[] = [];

    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(STORE_DIR, file);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            const note = JSON.parse(data) as NoteWithMatrix;
            allNotes.push(note);
        } catch (err) {
            console.error(`Error reading note ${file}:`, err);
        }
    }

    // Sort by createdAt descending
    allNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allNotes.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    const data = allNotes.slice(offset, offset + pageSize);

    return {
        data,
        pagination: {
            total,
            page,
            pageSize,
            totalPages
        }
    };
}

export async function getNoteById(id: string): Promise<NoteWithMatrix | null> {
    await ensureDir();
    const filePath = path.join(STORE_DIR, `${id}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const note = JSON.parse(data);
        return note;
    } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

export async function createNote(data: { title: string; deviceModelId: string; matrices?: number[][][] }): Promise<NoteWithMatrix> {
    await ensureDir();
    const id = uuidv4();
    const now = new Date().toISOString();

    const pages: NotePage[] = (data.matrices || [[]]).map(matrix => ({
        id: uuidv4(),
        matrix,
        createdAt: now,
        updatedAt: now,
    }));

    const note: NoteWithMatrix = {
        id,
        title: data.title,
        deviceModelId: data.deviceModelId,
        createdAt: now,
        updatedAt: now,
        pages
    };

    const filePath = path.join(STORE_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(note, null, 2));

    return note;
}

export async function updateNote(id: string, updates: Partial<NoteWithMatrix>): Promise<NoteWithMatrix | null> {
    const note = await getNoteById(id);
    if (!note) return null;

    const updatedNote = {
        ...note,
        ...updates,
        updatedAt: new Date().toISOString()
    };

    const filePath = path.join(STORE_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedNote, null, 2));

    return updatedNote;
}

export async function deleteNote(id: string): Promise<boolean> {
    await ensureDir();
    const filePath = path.join(STORE_DIR, `${id}.json`);
    try {
        await fs.unlink(filePath);
        return true;
    } catch (err: any) {
        if (err.code === 'ENOENT') return false;
        throw err;
    }
}
