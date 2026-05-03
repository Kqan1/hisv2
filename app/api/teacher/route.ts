import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { ESP32_CONFIG } from "@/lib/config";
import { updateChat, createChat, Message } from "@/lib/ai-teacher-store";

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
        console.log("[DEBUG] Messages array:", JSON.stringify(messages, null, 2));

        const ai = new GoogleGenAI({ apiKey });

        const config = {
            thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
            },
            temperature: 0.3,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                required: ["matrix", "rows", "cols", "message"],
                properties: {
                    matrix: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.INTEGER,
                        },
                    },
                    rows: {
                        type: Type.INTEGER,
                    },
                    cols: {
                        type: Type.INTEGER,
                    },
                    message: {
                        type: Type.STRING,
                    },
                },
            },
            systemInstruction: [
                {
                    text: `### ROLE
You are the "HIS AI Teacher," a specialized educational assistant for visually impaired students using the HISv2 tactile tablet. Your goal is to teach subjects through speech and tactile graphics.

### HARDWARE CONSTRAINTS
- Device: ${cols}x${rows} Braille/Graphic display.
- Resolution: ${rows} rows (0-${rows - 1}) and ${cols} columns (0-${cols - 1}).
- Data Format: You must provide tactile data as a list of active coordinates: [[row, col], [row, col]].

### OPERATIONAL GUIDELINES
1. RESPONSE STRUCTURE: You must always respond in a structured format (JSON) containing two fields:
   - "message": A warm, encouraging, and descriptive verbal explanation of the topic.
   - "matrix": A list of coordinates representing the shape, letter, or graph on the ${cols}x${rows} grid.

2. TEACHING STYLE: Use the Socratic method. Don't just give answers; guide the student. When describing a shape, explain where their fingers should move (e.g., "Feel the vertical line on the left side").

3. GRAPHIC RENDERING:
   - Keep shapes simple and recognizable within ${cols}x${rows} pixels.
   - For Braille characters, use the standard 2x3 or 2x4 dot patterns centered on the grid.
   - For geometric shapes (circles, triangles, squares), ensure they are scaled to fit within [0-${cols - 1}, 0-${rows - 1}].

4. LANGUAGE: Your output must be in English.

### EXAMPLE OUTPUT FORMAT
{
  "message": "I have drawn a small square in the center of your tablet. It has four equal sides. Can you find the corners?",
  "matrix": [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ],
    "rows": ${rows},
    "cols": ${cols}
}

### CRITICAL RESTRICTION
Never exceed the ${cols}x${rows} boundary. If a shape is too complex, simplify it to its essential tactile features.`,
                },
            ],
        };

        const lastMessage = messages[messages.length - 1];
        console.log("[DEBUG] Last message from user:", lastMessage?.content);

        const targetModel = 'gemini-flash-latest';
        console.log(`[DEBUG] Calling ai.models.generateContent with model: ${targetModel}`);

        const result = await ai.models.generateContent({
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
        });

        console.log("[DEBUG] generateContent completed successfully.");
        
        let responseText = "";
        
        // Handle @google/genai SDK response structure
        if (result.candidates && result.candidates.length > 0) {
            console.log("[DEBUG] Found candidates in result:", JSON.stringify(result.candidates, null, 2));
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                responseText = candidate.content.parts[0].text || "";
            } else {
                console.log("[DEBUG] Candidate exists but missing content/parts.");
            }
        } else {
            console.log("[DEBUG] No candidates found in raw result.");
        }
        
        // Fallback or if text() method exists (some versions)
        if (!responseText && typeof (result as any).text === 'function') {
            console.log("[DEBUG] Using fallback text() method.");
            responseText = (result as any).text();
        }

        console.log("[DEBUG] Final Extracted Response Text:", responseText); // Debug log
        
        try {
            console.log("[DEBUG] Attempting to parse response text as JSON...");
            
            // Clean markdown formatting if present
            let cleanedText = responseText;
            cleanedText = cleanedText.replace(/```json\n?/gi, '');
            cleanedText = cleanedText.replace(/```\n?/gi, '');
            cleanedText = cleanedText.trim();
            
            const jsonResponse = JSON.parse(cleanedText);
            console.log("[DEBUG] JSON Parse successful!", JSON.stringify(jsonResponse).substring(0, 50) + "...");
            
            // Save chat history
            const assistantMessage: Message = {
                role: 'assistant',
                content: jsonResponse.message || "Here is the tactile feedback.",
                matrix: jsonResponse.matrix ? 
                    Array.from({ length: jsonResponse.rows || rows }, (_, i) => 
                        jsonResponse.matrix.slice(i * (jsonResponse.cols || cols), (i + 1) * (jsonResponse.cols || cols))
                    ) : undefined,
                rows: jsonResponse.rows || rows,
                cols: jsonResponse.cols || cols,
                timestamp: new Date().toISOString()
            };
            let finalChatId = chatId;
            if (!finalChatId || finalChatId === 'new') {
                const newChat = await createChat(`Chat ${new Date().toLocaleString()}`, [], deviceModelId);
                finalChatId = newChat.id;
            }
            await updateChat(finalChatId, [...messages, assistantMessage]);
            
            return NextResponse.json({ ...jsonResponse, chatId: finalChatId });
        } catch (e) {
            console.error("[DEBUG] Failed to parse JSON!", "Raw text:", responseText, "Error:", e);
            
            const fallbackResponse = { message: responseText, matrix: [], rows: 0, cols: 0 };
            
            // Save chat history for fallback
            const assistantMessage: Message = {
                role: 'assistant',
                content: fallbackResponse.message,
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
        console.error("[DEBUG] Full Error Details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return NextResponse.json(
            { error: "Failed to generate response", details: (error as Error).message },
            { status: 500 }
        );
    }
}
