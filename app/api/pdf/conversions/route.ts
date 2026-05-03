import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { getConversions, createConversion, updateConversion, getUploadsDir } from "@/lib/pdf-store";
import type { PdfPage } from "@/lib/pdf-store";
import { textToBraillePages } from "@/lib/braille";
import { getModelById } from "@/lib/config";

export const dynamic = 'force-dynamic';

// GET: List all conversions
export async function GET() {
    try {
        const conversions = await getConversions();
        return NextResponse.json(conversions);
    } catch (error) {
        console.error("Error listing conversions:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// POST: Upload PDF and process it
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const deviceModelId = (formData.get('deviceModelId') as string) || 'amc-1';

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
        }

        const model = getModelById(deviceModelId);
        const rows = model.rows;
        const cols = model.cols;

        // Create conversion record in processing state
        const title = file.name.replace(/\.pdf$/i, '');
        const conversion = await createConversion(title, deviceModelId, [], 'processing');

        // Save file to uploads dir
        const uploadsDir = getUploadsDir();
        await fs.mkdir(uploadsDir, { recursive: true });
        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadPath = path.join(uploadsDir, `${conversion.id}.pdf`);
        await fs.writeFile(uploadPath, buffer);

        const apiKey = process.env.GEMINI_API_KEY;

        // ====================================================================
        // PRIMARY PATH: Send the actual PDF to Gemini Vision
        // This lets the AI see both text AND images/vector graphics
        // ====================================================================
        if (apiKey) {
            try {
                console.log("[PDF] Sending PDF to Gemini Vision for analysis...");
                const contentBlocks = await analyzeWithVision(apiKey, buffer, rows, cols);
                console.log(`[PDF] Vision returned ${contentBlocks.length} blocks:`, contentBlocks.map(b => `${b.type}:${b.label}`));

                if (contentBlocks.length > 0) {
                    const pages = blocksToPages(contentBlocks, rows, cols);
                    console.log(`[PDF] Generated ${pages.length} pages from vision analysis`);
                    await updateConversion(conversion.id, { pages, status: 'done' });
                    return NextResponse.json({ id: conversion.id, status: 'done', pageCount: pages.length });
                } else {
                    console.log("[PDF] Vision returned 0 blocks, falling back to text-only");
                }
            } catch (err) {
                console.error("[PDF] Gemini Vision analysis failed, falling back to text-only:", err);
            }
        }

        // ====================================================================
        // FALLBACK PATH: Extract text only and convert to braille
        // Used when no API key or when vision analysis fails
        // ====================================================================
        let extractedText = '';
        try {
            const pdfParse = require('pdf-parse/lib/pdf-parse.js');
            const pdfData = await pdfParse(buffer);
            extractedText = pdfData.text || '';
        } catch (err) {
            console.error("PDF parse error:", err);
            await updateConversion(conversion.id, {
                status: 'error',
                error: 'Failed to extract text from PDF'
            });
            return NextResponse.json({
                error: "Failed to extract text from PDF",
                id: conversion.id
            }, { status: 500 });
        }

        if (!extractedText.trim()) {
            const pages: PdfPage[] = [{
                type: 'summary',
                matrix: Array.from({ length: rows }, () => Array(cols).fill(-1)),
                label: 'This PDF contains no extractable text or images.'
            }];
            await updateConversion(conversion.id, { pages, status: 'done' });
            return NextResponse.json({ id: conversion.id, status: 'done', pageCount: pages.length });
        }

        // Pure text → braille conversion (no AI needed)
        const braillePages = textToBraillePages(extractedText, rows, cols);
        const pages: PdfPage[] = braillePages.map((matrix, i) => ({
            type: 'braille' as const,
            matrix,
            label: `Text page ${i + 1}`,
            textContent: extractedText
        }));

        await updateConversion(conversion.id, { pages, status: 'done' });
        return NextResponse.json({ id: conversion.id, status: 'done', pageCount: pages.length });

    } catch (error) {
        console.error("Error processing PDF:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// ========================================================================
// AI ANALYSIS — VISION (sends the actual PDF to Gemini)
// ========================================================================

type ContentBlock = {
    type: 'text' | 'image' | 'summary';
    content: string;
    label?: string;
    matrix?: number[][];
};

async function analyzeWithVision(
    apiKey: string,
    pdfBuffer: Buffer,
    rows: number,
    cols: number
): Promise<ContentBlock[]> {
    const ai = new GoogleGenAI({ apiKey });

    // Convert PDF buffer to base64 for inline_data
    const pdfBase64 = pdfBuffer.toString('base64');

    const result = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                required: ['blocks'],
                properties: {
                    blocks: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            required: ['type', 'content'],
                            properties: {
                                type: {
                                    type: Type.STRING,
                                    description: 'Block type: "text" for readable text, "image" for a simple drawable graphic, "summary" for complex image description'
                                },
                                content: {
                                    type: Type.STRING,
                                    description: 'The text content to be converted to braille, or a description of the image'
                                },
                                label: {
                                    type: Type.STRING,
                                    description: 'Short label for this content block'
                                },
                                matrix: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.ARRAY,
                                        items: { type: Type.INTEGER }
                                    },
                                    description: `For type="image" ONLY: a ${rows}x${cols} matrix (${rows} rows, ${cols} cols) using 1 (raised/on) and -1 (lowered/off)`
                                }
                            }
                        }
                    }
                }
            },
            systemInstruction: [{
                text: `You are analyzing a PDF document for display on a ${cols}×${rows} tactile Braille display for visually impaired users.

You can SEE the PDF — both its text and any images, shapes, diagrams, or vector graphics.

Your job is to extract ALL content (text AND visuals) in document order and return structured blocks.

### Block Types

1. **"text"** — For readable text content (paragraphs, headings, lists, etc.)
   - Put the actual text in "content". It will be converted to 6-dot braille automatically.
   - Keep original wording, don't summarize.

2. **"image"** — For simple shapes/graphics that CAN be drawn on a ${cols}×${rows} grid
   - Things like: triangles, rectangles, circles, arrows, lines, simple diagrams, basic charts, letters/symbols
   - Provide a "matrix" field: exactly ${rows} rows × ${cols} columns, using 1 (raised dot) and -1 (lowered dot)
   - Draw the shape as recognizable as possible within the grid
   - Put a description in "content" (e.g., "Triangle inside a rectangle")

3. **"summary"** — For complex images/figures/tables that are TOO detailed for ${cols}×${rows} pixels
   - Put a text description in "content" explaining what the image shows
   - This text will be converted to braille for the user to read

### Rules
- Return blocks in the ORDER they appear in the document
- Each block = one page on the display (don't mix text and images on the same block)
- For text blocks, break long text into reasonable chunks
- Every block needs a short "label"
- Image matrices must be EXACTLY ${rows} rows and ${cols} columns`
            }]
        },
        contents: [{
            role: 'user',
            parts: [
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: pdfBase64
                    }
                },
                {
                    text: 'Analyze this PDF document. Extract all text and identify all images/shapes/graphics. Return structured blocks for the tactile display.'
                }
            ]
        }]
    });

    try {
        let responseText = '';
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            console.log("[PDF-Vision] Candidate finish reason:", candidate.finishReason);
            if (candidate.content?.parts?.[0]?.text) {
                responseText = candidate.content.parts[0].text;
            }
        } else {
            console.log("[PDF-Vision] No candidates in response");
        }

        if (!responseText) {
            console.log("[PDF-Vision] Empty response text");
            return [];
        }

        console.log("[PDF-Vision] Raw response length:", responseText.length);
        console.log("[PDF-Vision] Response preview:", responseText.substring(0, 300));

        const cleaned = responseText.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.blocks && Array.isArray(parsed.blocks)) {
            console.log(`[PDF-Vision] Parsed ${parsed.blocks.length} blocks`);
            return parsed.blocks.map((b: any) => ({
                type: b.type || 'text',
                content: b.content || '',
                label: b.label,
                matrix: validateMatrix(b.matrix, rows, cols)
            }));
        }
    } catch (e) {
        console.error("[PDF-Vision] Failed to parse AI vision response:", e);
    }

    return [];
}

// ========================================================================
// HELPERS
// ========================================================================

function blocksToPages(blocks: ContentBlock[], rows: number, cols: number): PdfPage[] {
    const pages: PdfPage[] = [];

    for (const block of blocks) {
        if (block.type === 'text') {
            const braillePages = textToBraillePages(block.content, rows, cols);
            for (const matrix of braillePages) {
                pages.push({
                    type: 'braille',
                    matrix,
                    label: block.label || 'Braille text',
                    textContent: block.content
                });
            }
        } else if (block.type === 'image' && block.matrix) {
            pages.push({
                type: 'image',
                matrix: block.matrix,
                label: block.label || 'Image',
                textContent: block.content
            });
        } else if (block.type === 'summary') {
            const summaryPages = textToBraillePages(block.content, rows, cols);
            for (const matrix of summaryPages) {
                pages.push({
                    type: 'summary',
                    matrix,
                    label: block.label || 'Image description',
                    textContent: block.content
                });
            }
        }
    }

    if (pages.length === 0) {
        pages.push({
            type: 'summary',
            matrix: Array.from({ length: rows }, () => Array(cols).fill(-1)),
            label: 'Could not process PDF content'
        });
    }

    return pages;
}

function validateMatrix(matrix: any, rows: number, cols: number): number[][] | undefined {
    if (!Array.isArray(matrix)) return undefined;
    if (matrix.length !== rows) return undefined;

    return matrix.map((row: any) => {
        if (!Array.isArray(row) || row.length !== cols) {
            return Array(cols).fill(-1);
        }
        return row.map((cell: any) => (cell === 1 ? 1 : -1));
    });
}

