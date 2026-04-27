import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> },
) {
    try {
        const { filename } = await params;

        // Prevent directory traversal
        if (filename.includes("..") || filename.includes("/")) {
            return NextResponse.json(
                { error: "Invalid filename" },
                { status: 400 },
            );
        }

        const filePath = path.join(process.cwd(), "data", "lecture-records", "audio", filename);

        const fileBuffer = await fs.readFile(filePath);

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/webm",
                "Content-Length": fileBuffer.length.toString(),
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (err: any) {
        if (err.code === "ENOENT") {
            return NextResponse.json(
                { error: "Audio file not found" },
                { status: 404 },
            );
        }
        console.error("Error serving audio file:", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
