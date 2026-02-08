import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
    const data = await db.lectureRecord.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            _count: {
                select: { frames: true },
            },
            frames: {
                orderBy: { deltaTime: "desc" },
                include: {
                    pixelMatrix: true,
                },
            },
        },
    });

    return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { title, frames } = body;

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

        // Transaction to ensure all data is created or nothing is
        // We set a higher timeout for large records
        const result = await db.$transaction(
            async (tx) => {
                const lectureRecord = await tx.lectureRecord.create({
                    data: {
                        title: title.trim(),
                    },
                });

                // Create frames with their pixel matrices
                // We cannot use createMany for nested writes, so we must map and create
                // Optimization: using Promise.all to run these in parallel within the transaction
                const framePromises = frames.map((frame: any) =>
                    tx.frame.create({
                        data: {
                            lectureRecordId: lectureRecord.id,
                            deltaTime: frame.deltaTime,
                            pixelMatrix: {
                                create: {
                                    matrix: frame.matrix,
                                },
                            },
                        },
                    })
                );

                await Promise.all(framePromises);

                return lectureRecord;
            },
            {
                maxWait: 10000,
                timeout: 30000, // Increased timeout for larger records
            },
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
