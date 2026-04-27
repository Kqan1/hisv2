import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const STORE_DIR = path.join(process.cwd(), "data", "lecture-records");

export type FrameWithMatrix = {
    id: string;
    lectureRecordId: string;
    deltaTime: number;
    createdAt: string;
    pixelMatrix: {
        id: string;
        matrix: any;
        createdAt: string;
        updatedAt: string;
    } | null;
};

export type LectureRecordWithFrames = {
    id: string;
    title: string;
    deviceModelId: string;
    audioPath: string | null;
    createdAt: string;
    updatedAt: string;
    frames: FrameWithMatrix[];
};

export type LectureRecordSummary = Omit<LectureRecordWithFrames, 'frames'> & {
    _count: { frames: number };
    frames: FrameWithMatrix[];
};

async function ensureDir() {
    try {
        await fs.mkdir(STORE_DIR, { recursive: true });
    } catch (err) {
        // ignore if exists
    }
}

export async function getLectureRecords() {
    await ensureDir();
    const files = await fs.readdir(STORE_DIR);
    const records: any[] = [];

    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(STORE_DIR, file);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            const record = JSON.parse(data) as LectureRecordWithFrames;
            
            records.push({
                id: record.id,
                title: record.title,
                deviceModelId: record.deviceModelId,
                audioPath: record.audioPath,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
                _count: { frames: record.frames.length },
                frames: record.frames.length > 0 ? [record.frames[0]] : [],
            });
        } catch (err) {
            console.error(`Error reading record ${file}:`, err);
        }
    }

    // Sort by createdAt descending
    return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getLectureRecordById(id: string): Promise<LectureRecordWithFrames | null> {
    await ensureDir();
    const filePath = path.join(STORE_DIR, `${id}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const record = JSON.parse(data);
        return record;
    } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

export async function createLectureRecord(data: Omit<LectureRecordWithFrames, 'id' | 'createdAt' | 'updatedAt' | 'frames'>, framesData: any[]): Promise<LectureRecordWithFrames> {
    await ensureDir();
    const id = uuidv4();
    const now = new Date().toISOString();

    const frames: FrameWithMatrix[] = framesData.map((f: any) => ({
        id: uuidv4(),
        lectureRecordId: id,
        deltaTime: f.deltaTime,
        createdAt: now,
        pixelMatrix: {
            id: uuidv4(),
            matrix: f.matrix,
            createdAt: now,
            updatedAt: now,
        }
    }));

    const record: LectureRecordWithFrames = {
        id,
        ...data,
        createdAt: now,
        updatedAt: now,
        frames,
    };

    const filePath = path.join(STORE_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2));

    return record;
}

export async function updateLectureRecord(id: string, updates: Partial<LectureRecordWithFrames>): Promise<LectureRecordWithFrames | null> {
    const record = await getLectureRecordById(id);
    if (!record) return null;

    const updatedRecord = {
        ...record,
        ...updates,
        updatedAt: new Date().toISOString()
    };

    const filePath = path.join(STORE_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedRecord, null, 2));

    return updatedRecord;
}

export async function deleteLectureRecord(id: string): Promise<boolean> {
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
