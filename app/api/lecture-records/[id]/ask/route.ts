import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not set" },
            { status: 500 },
        );
    }

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
        const { question } = body;

        if (!question || typeof question !== "string" || question.trim().length === 0) {
            return NextResponse.json(
                { error: "Question is required" },
                { status: 400 },
            );
        }

        // Fetch the lecture record with all frames and matrices
        const record = await db.lectureRecord.findUnique({
            where: { id: recordId },
            include: {
                frames: {
                    include: { pixelMatrix: true },
                    orderBy: { deltaTime: "asc" },
                },
            },
        });

        if (!record) {
            return NextResponse.json(
                { error: "Record not found" },
                { status: 404 },
            );
        }

        // Build a concise context summary of the record for the AI
        const totalDuration = record.frames.length > 0
            ? record.frames[record.frames.length - 1].deltaTime
            : 0;

        const frameSummaries = record.frames.map((frame, i) => {
            const matrix = frame.pixelMatrix?.matrix as number[][] | undefined;
            let activePixels = 0;
            if (matrix && Array.isArray(matrix)) {
                activePixels = matrix.flat().filter((v) => v === 1).length;
            }
            return `Frame ${i + 1}: time=${frame.deltaTime}ms, activePixels=${activePixels}`;
        });

        // Include a few key frame matrices for more detailed context
        const keyFrameIndices: number[] = [];
        if (record.frames.length > 0) {
            keyFrameIndices.push(0); // first
            if (record.frames.length > 2) {
                keyFrameIndices.push(Math.floor(record.frames.length / 2)); // middle
            }
            if (record.frames.length > 1) {
                keyFrameIndices.push(record.frames.length - 1); // last
            }
        }

        const keyFrameDetails = keyFrameIndices.map((idx) => {
            const frame = record.frames[idx];
            const matrix = frame.pixelMatrix?.matrix;
            return `Frame ${idx + 1} (at ${frame.deltaTime}ms):\n${JSON.stringify(matrix)}`;
        });

        const systemPrompt = `You are an AI assistant that answers questions about a lecture recording made on a 10x15 tactile pixel matrix display (10 rows, 15 columns). Each cell is either 0 (off) or 1 (on).

Here is the context of the recording:

**Title:** ${record.title}
**Created:** ${record.createdAt.toISOString()}
**Total Frames:** ${record.frames.length}
**Total Duration:** ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)

**Frame Timeline:**
${frameSummaries.join("\n")}

**Key Frame Matrices (showing pixel data):**
${keyFrameDetails.join("\n\n")}

Based on this data, answer the user's question about this recording as helpfully as possible. If the question is about what was drawn, analyze the matrix patterns. If it's about timing, use the deltaTime values. Be concise and informative.`;

        const ai = new GoogleGenAI({ apiKey });

        const result = await ai.models.generateContent({
            model: "gemini-flash-latest",
            config: {
                temperature: 0.5,
                systemInstruction: [{ text: systemPrompt }],
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: question.trim() }],
                },
            ],
        });

        let answer = "";
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content?.parts && candidate.content.parts.length > 0) {
                answer = candidate.content.parts[0].text || "";
            }
        }

        if (!answer && typeof (result as unknown as Record<string, unknown>).text === "function") {
            answer = ((result as unknown as { text: () => string }).text)();
        }

        return NextResponse.json({ answer: answer || "I couldn't generate an answer. Please try rephrasing your question." });
    } catch (error) {
        console.error("Error in Ask AI API:", error);
        return NextResponse.json(
            { error: "Failed to generate answer" },
            { status: 500 },
        );
    }
}
