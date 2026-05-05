import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { ESP32_CONFIG } from "@/lib/config";
import { updateChat, createChat, Message, TeacherPage } from "@/lib/ai-teacher-store";
import { withRetry } from "@/lib/gemini-retry";

export async function POST(req: Request) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not set" },
            { status: 500 }
        );
    }

    try {
        console.log("[DEBUG] --- New API Request received ---");
        const body = await req.json();
        const { messages, rows: clientRows, cols: clientCols, chatId, deviceModelId } = body;
        const rows = clientRows || ESP32_CONFIG.rows;
        const cols = clientCols || ESP32_CONFIG.cols;
        console.log("[DEBUG] Parsed request body (messages count):", messages?.length, "rows:", rows, "cols:", cols);

        const ai = new GoogleGenAI({ apiKey });

        const config = {
            thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
            },
            temperature: 0.3,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                required: ["message", "pages"],
                properties: {
                    message: {
                        type: Type.STRING,
                        description: "A spoken explanation of what you produced. This is read aloud via TTS.",
                    },
                    pages: {
                        type: Type.ARRAY,
                        description: "Array of pages to display on the tactile tablet. Each page is one screen.",
                        items: {
                            type: Type.OBJECT,
                            required: ["type", "label"],
                            properties: {
                                type: {
                                    type: Type.STRING,
                                    description: '"graphic" for hand-drawn matrix, "braille" for text rendered as 6-dot braille',
                                },
                                label: {
                                    type: Type.STRING,
                                    description: "Short label for this page (e.g., 'Triangle', 'Explanation page 1')",
                                },
                                matrix: {
                                    type: Type.ARRAY,
                                    items: { type: Type.INTEGER },
                                    description: `For "graphic" pages ONLY: a flat array of ${rows * cols} integers (-1 or 1) representing the ${cols}x${rows} grid row by row.`,
                                },
                                text: {
                                    type: Type.STRING,
                                    description: 'For "braille" pages ONLY: the text content to render as 6-dot braille on the tablet.',
                                },
                            },
                        },
                    },
                },
            },
            systemInstruction: [
                {
                    text: `### ROLE
You are the "HIS AI Teacher," a specialized educational assistant for visually impaired students using the HISv2 tactile tablet. Your goal is to teach subjects through speech and tactile graphics/braille text.

### HARDWARE CONSTRAINTS
- Device: ${cols}x${rows} Braille/Graphic display.
- Resolution: ${rows} rows (0-${rows - 1}) and ${cols} columns (0-${cols - 1}).
- Pixel values for graphic pages: Use 1 (raised/up) and -1 (lowered/down). Never use 0.

### OUTPUT FORMAT
You produce TWO things per response:
1. **"message"**: A warm, encouraging verbal explanation (read aloud via TTS). Do not use emojis.
2. **"pages"**: An array of pages to display on the tablet. Each page is one screen.

### PAGE TYPES

**"graphic"** — A hand-drawn pixel matrix for shapes, diagrams, geometric figures, charts.
- Provide a "matrix" field: a flat array of exactly ${rows * cols} integers using only -1 and 1.
- Use 1 for raised pixels (the shape) and -1 for background.
- DO NOT put text in graphic pages — they are purely visual.
- Keep shapes simple and recognizable within the ${cols}x${rows} grid.

**"braille"** — Text content that will be automatically rendered as 6-dot braille on the tablet.
- Provide a "text" field with the text to display.
- The system will automatically paginate long text into multiple display pages.
- Use this for explanations, descriptions, definitions, labels, etc.

### GUIDELINES
- Separate geometry/shapes and text onto DIFFERENT pages.
- For a question like "Draw a triangle and explain it":
  1. Page 1: type="graphic", label="Triangle", matrix=[...triangle shape...]
  2. Page 2: type="braille", label="Explanation", text="A triangle has three sides and three angles..."
- For a purely text question like "What is gravity?":
  1. Page 1: type="braille", label="Gravity", text="Gravity is a force that attracts..."
- Use the Socratic method. Guide the student, describe where to feel shapes.
- Every response must have at least one page.

### EXAMPLE: Mixed response
{
  "message": "I have drawn a small square for you. Feel the four equal sides. On the next page, I explain what a square is.",
  "pages": [
    {
      "type": "graphic",
      "label": "Square",
      "matrix": [
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1, 1, 1, 1, 1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1, 1,-1,-1, 1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1, 1,-1,-1, 1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1, 1, 1, 1, 1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1
      ]
    },
    {
      "type": "braille",
      "label": "What is a square?",
      "text": "A square is a shape with four equal sides and four right angles. Each corner is 90 degrees."
    }
  ]
}

### CRITICAL RESTRICTION
Never exceed the ${cols}x${rows} boundary for graphic matrices. Always use -1 and 1 only in matrices — never 0. For braille pages, just provide the text — the system handles rendering.`,
                },
            ],
        };

        const lastMessage = messages[messages.length - 1];
        console.log("[DEBUG] Last message from user:", lastMessage?.content);

        const targetModel = 'gemini-flash-latest';
        console.log(`[DEBUG] Calling ai.models.generateContent with model: ${targetModel}`);

        const result = await withRetry(() => ai.models.generateContent({
            model: targetModel,
            config: config,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: lastMessage.content }
                    ]
                }
            ]
        }), 'AI Teacher');

        console.log("[DEBUG] generateContent completed successfully.");

        let responseText = "";

        // Handle @google/genai SDK response structure
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content?.parts?.[0]?.text) {
                responseText = candidate.content.parts[0].text;
            }
        }

        // Fallback
        if (!responseText && typeof (result as any).text === 'function') {
            responseText = (result as any).text();
        }

        console.log("[DEBUG] Final Extracted Response Text:", responseText.substring(0, 200));

        try {
            // Clean markdown formatting if present
            let cleanedText = responseText;
            cleanedText = cleanedText.replace(/```json\n?/gi, '');
            cleanedText = cleanedText.replace(/```\n?/gi, '');
            cleanedText = cleanedText.trim();

            const jsonResponse = JSON.parse(cleanedText);
            console.log("[DEBUG] JSON Parse successful!");

            // Process pages into stored format
            const storedPages: TeacherPage[] = [];
            const aiPages = jsonResponse.pages || [];

            for (const page of aiPages) {
                if (page.type === 'graphic' && page.matrix) {
                    // Convert flat array to 2D matrix
                    const matrix2D: number[][] = [];
                    for (let i = 0; i < rows; i++) {
                        const row = page.matrix.slice(i * cols, (i + 1) * cols);
                        // Ensure correct length and values
                        matrix2D.push(
                            row.length === cols
                                ? row.map((v: number) => (v === 1 ? 1 : -1))
                                : Array(cols).fill(-1)
                        );
                    }
                    storedPages.push({
                        type: 'graphic',
                        label: page.label || 'Graphic',
                        matrix: matrix2D,
                    });
                } else if (page.type === 'braille' && page.text) {
                    storedPages.push({
                        type: 'braille',
                        label: page.label || 'Text',
                        text: page.text,
                    });
                }
            }

            // Fallback: if no valid pages, treat as a single braille page
            if (storedPages.length === 0 && jsonResponse.message) {
                storedPages.push({
                    type: 'braille',
                    label: 'Response',
                    text: jsonResponse.message,
                });
            }

            // Save chat history
            const assistantMessage: Message = {
                role: 'assistant',
                content: jsonResponse.message || "Here is the tactile feedback.",
                pages: storedPages,
                rows,
                cols,
                timestamp: new Date().toISOString()
            };

            let finalChatId = chatId;
            if (!finalChatId || finalChatId === 'new') {
                const newChat = await createChat(`Chat ${new Date().toLocaleString()}`, [], deviceModelId);
                finalChatId = newChat.id;
            }
            await updateChat(finalChatId, [...messages, assistantMessage]);

            return NextResponse.json({
                message: jsonResponse.message,
                pages: storedPages,
                rows,
                cols,
                chatId: finalChatId,
            });
        } catch (e) {
            console.error("[DEBUG] Failed to parse JSON!", "Raw text:", responseText, "Error:", e);

            const fallbackResponse = {
                message: responseText,
                pages: [{ type: 'braille' as const, label: 'Response', text: responseText }],
                rows,
                cols,
            };

            const assistantMessage: Message = {
                role: 'assistant',
                content: fallbackResponse.message,
                pages: fallbackResponse.pages,
                timestamp: new Date().toISOString()
            };

            let finalChatId = chatId;
            if (!finalChatId || finalChatId === 'new') {
                const newChat = await createChat(`Chat ${new Date().toLocaleString()}`, []);
                finalChatId = newChat.id;
            }
            await updateChat(finalChatId, [...messages, assistantMessage]);

            return NextResponse.json({ ...fallbackResponse, chatId: finalChatId }, { status: 200 });
        }

    } catch (error) {
        console.error("[DEBUG] Error caught in AI Teacher API:", error);
        return NextResponse.json(
            { error: "Failed to generate response", details: (error as Error).message },
            { status: 500 }
        );
    }
}
