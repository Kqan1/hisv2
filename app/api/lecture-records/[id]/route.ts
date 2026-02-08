import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const recordId = parseInt(id);

        if (isNaN(recordId)) {
            return NextResponse.json(
                { error: "Invalid record ID" },
                { status: 400 },
            );
        }

        const record = await db.lectureRecord.findUnique({
            where: { id: recordId },
            include: {
                frames: {
                    include: {
                        pixelMatrix: true,
                    },
                    orderBy: {
                        deltaTime: "asc",
                    },
                },
            },
        });

        if (!record) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
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
        const recordId = parseInt(id);

        if (isNaN(recordId)) {
            return NextResponse.json(
                { error: "Invalid record ID" },
                { status: 400 },
            );
        }

        const body = await request.json();
        const { title } = body;

        if (!title || typeof title !== "string" || title.trim().length === 0) {
            return NextResponse.json(
                { error: "Valid title is required" },
                { status: 400 },
            );
        }

        const updatedRecord = await db.lectureRecord.update({
            where: { id: recordId },
            data: {
                title: title.trim().slice(0, 255),
            },
        });

        return NextResponse.json(updatedRecord);
    } catch (error) {
        console.error("Error updating record:", error);
        if ((error as any).code === "P2025") {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
        }
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
        const recordId = parseInt(id);

        if (isNaN(recordId)) {
            return NextResponse.json(
                { error: "Invalid record ID" },
                { status: 400 },
            );
        }

        await db.lectureRecord.delete({
            where: { id: recordId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting record:", error);
        if ((error as any).code === "P2025") {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
        }
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
