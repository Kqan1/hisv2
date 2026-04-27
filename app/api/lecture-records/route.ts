import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getLectureRecords, createLectureRecord } from "@/lib/lecture-records-store";

export async function GET() {
    const data = await getLectureRecords();
    return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { title, frames, audioData, deviceModelId } = body;

        console.log("Received API POST:", { title, framesCount: frames?.length, audioDataLength: audioData?.length });

        if (!title || typeof title !== "string" || title.trim().length === 0) {
            return NextResponse.json(
                { error: "Title is required" },
                { status: 400 },
            );
        }

        if (!frames || !Array.isArray(frames) || frames.length === 0) {
            return NextResponse.json(
                { error: "At least one frame is required" },
                { status: 400 },
            );
        }

        let audioPath = null;
        if (audioData) {
            try {
                const buffer = Buffer.from(audioData, 'base64');
                const uploadDir = path.join(process.cwd(), "data", "lecture-records", "audio");
                
                await fs.mkdir(uploadDir, { recursive: true });
                
                const fileName = `${Date.now()}-${uuidv4()}.webm`;
                const filePath = path.join(uploadDir, fileName);
                
                await fs.writeFile(filePath, buffer);
                
                audioPath = `/api/lecture-records/audio/${fileName}`;
            } catch (err) {
                console.error("Error saving audio file:", err);
                return NextResponse.json(
                     { error: "Failed to save audio file" },
                     { status: 500 }
                );
            }
        }

        const result = await createLectureRecord(
            {
                title: title.trim(),
                deviceModelId: deviceModelId || "amc-1",
                audioPath: audioPath,
            },
            frames
        );

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Error creating lecture record:", error);
        return NextResponse.json(
            { error: "Failed to create lecture record" },
            { status: 500 },
        );
    }
}
