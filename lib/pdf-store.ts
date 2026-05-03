import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from 'uuid';

const STORE_DIR = path.join(process.cwd(), "data", "pdf-conversions");
const UPLOADS_DIR = path.join(STORE_DIR, "uploads");

export interface PdfPage {
    type: 'braille' | 'image' | 'summary';
    matrix: number[][];
    label?: string;
    textContent?: string;  // Original text for braille/summary pages
}

export interface PdfConversion {
    id: string;
    title: string;
    deviceModelId: string;
    pages: PdfPage[];
    status: 'processing' | 'done' | 'error';
    error?: string;
    createdAt: string;
    updatedAt: string;
}

async function ensureDir() {
    await fs.mkdir(STORE_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function getConversions(): Promise<PdfConversion[]> {
    await ensureDir();
    try {
        const files = await fs.readdir(STORE_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        const conversions: PdfConversion[] = [];

        for (const file of jsonFiles) {
            const content = await fs.readFile(path.join(STORE_DIR, file), 'utf-8');
            try {
                const parsed = JSON.parse(content);
                if (parsed.id) {
                    conversions.push(parsed);
                }
            } catch (e) {
                console.error(`Failed to parse ${file}`, e);
            }
        }

        return conversions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err: any) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

export async function getConversion(id: string): Promise<PdfConversion | null> {
    await ensureDir();
    try {
        const content = await fs.readFile(path.join(STORE_DIR, `${id}.json`), 'utf-8');
        return JSON.parse(content);
    } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

export async function createConversion(
    title: string,
    deviceModelId: string,
    pages: PdfPage[] = [],
    status: 'processing' | 'done' | 'error' = 'processing'
): Promise<PdfConversion> {
    await ensureDir();
    const conversion: PdfConversion = {
        id: uuidv4(),
        title,
        deviceModelId,
        pages,
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await fs.writeFile(
        path.join(STORE_DIR, `${conversion.id}.json`),
        JSON.stringify(conversion, null, 2)
    );
    return conversion;
}

export async function updateConversion(
    id: string,
    updates: Partial<PdfConversion>
): Promise<PdfConversion | null> {
    const conversion = await getConversion(id);
    if (!conversion) return null;

    const updated = {
        ...conversion,
        ...updates,
        updatedAt: new Date().toISOString()
    };

    await fs.writeFile(
        path.join(STORE_DIR, `${id}.json`),
        JSON.stringify(updated, null, 2)
    );
    return updated;
}

export async function deleteConversion(id: string): Promise<boolean> {
    try {
        // Delete the JSON file
        await fs.unlink(path.join(STORE_DIR, `${id}.json`));

        // Try to delete uploaded PDF too
        try {
            const files = await fs.readdir(UPLOADS_DIR);
            for (const file of files) {
                if (file.startsWith(id)) {
                    await fs.unlink(path.join(UPLOADS_DIR, file));
                }
            }
        } catch { /* ignore */ }

        return true;
    } catch {
        return false;
    }
}

export function getUploadsDir(): string {
    return UPLOADS_DIR;
}
