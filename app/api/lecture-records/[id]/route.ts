import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getLectureRecordById, updateLectureRecord, deleteLectureRecord } from "@/lib/lecture-records-store";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        const record = await getLectureRecordById(id);

        if (!record) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
        }

        // The store already returns frames ordered by their creation/deltaTime,
        // but let's ensure they're sorted by deltaTime ascending just in case
        if (record.frames) {
            record.frames.sort((a, b) => a.deltaTime - b.deltaTime);
        }

        return NextResponse.json(record);
    } catch (error) {
        console.error("Error fetching record:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        const body = await request.json();
        const { title } = body;

        if (!title || typeof title !== "string" || title.trim().length === 0) {
            return NextResponse.json(
                { error: "Valid title is required" },
                { status: 400 },
            );
        }

        const updatedRecord = await updateLectureRecord(id, {
            title: title.trim().slice(0, 255),
        });

        if (!updatedRecord) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
        }

        return NextResponse.json(updatedRecord);
    } catch (error) {
        console.error("Error updating record:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        const record = await getLectureRecordById(id);

        if (!record) {
             return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
        }

        // Delete audio file if it exists
        if (record.audioPath) {
            try {
                // audioPath is like /api/lecture-records/audio/filename.webm
                const fileName = record.audioPath.split('/').pop();
                const fullPath = path.join(process.cwd(), "data", "lecture-records", "audio", fileName!);
                await fs.unlink(fullPath);
                console.log(`Deleted audio file: ${fullPath}`);
            } catch (err) {
                console.error(`Failed to delete audio file for record ${id}:`, err);
                // Continue with record deletion even if file deletion fails
            }
        }

        const deleted = await deleteLectureRecord(id);
        if (!deleted) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting record:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
