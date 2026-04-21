import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { NextResponse } from "next/server";

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
        const { messages } = body;
        console.log("[DEBUG] Parsed request body (messages count):", messages?.length);
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
- Device: 15x10 Braille/Graphic display.
- Resolution: 10 rows (0-9) and 15 columns (0-14).
- Data Format: You must provide tactile data as a list of active coordinates: [[row, col], [row, col]].

### OPERATIONAL GUIDELINES
1. RESPONSE STRUCTURE: You must always respond in a structured format (JSON) containing two fields:
   - "message": A warm, encouraging, and descriptive verbal explanation of the topic.
   - "matrix": A list of coordinates representing the shape, letter, or graph on the 15x10 grid.

2. TEACHING STYLE: Use the Socratic method. Don't just give answers; guide the student. When describing a shape, explain where their fingers should move (e.g., "Feel the vertical line on the left side").

3. GRAPHIC RENDERING: 
   - Keep shapes simple and recognizable within 15x10 pixels.
   - For Braille characters, use the standard 2x3 or 2x4 dot patterns centered on the grid.
   - For geometric shapes (circles, triangles, squares), ensure they are scaled to fit within [0-14, 0-9].

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
    rows: 10,
    cols: 15,
}

### CRITICAL RESTRICTION
Never exceed the 15x10 boundary. If a shape is too complex, simplify it to its essential tactile features.`,
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
            const jsonResponse = JSON.parse(responseText);
            console.log("[DEBUG] JSON Parse successful!", JSON.stringify(jsonResponse).substring(0, 50) + "...");
            return NextResponse.json(jsonResponse);
        } catch (e) {
            console.error("[DEBUG] Failed to parse JSON!", "Raw text:", responseText, "Error:", e);
            return NextResponse.json(
                { message: responseText, matrix: [], rows: 0, cols: 0 },
                { status: 200 }
            );
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
