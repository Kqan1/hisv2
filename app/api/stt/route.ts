import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/stt
 * Accepts audio as multipart/form-data (field name: "file") and returns
 * transcribed text via ElevenLabs Scribe v2.
 */
export async function POST(request: NextRequest) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "ELEVENLABS_API_KEY is not set" },
            { status: 500 }
        );
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "No audio file provided" },
                { status: 400 }
            );
        }

        // Forward to ElevenLabs Speech-to-Text API
        const elevenForm = new FormData();
        elevenForm.append("file", file);
        elevenForm.append("model_id", "scribe_v2");
        // Optional: specify language for better accuracy
        // elevenForm.append("language_code", "en");

        const response = await fetch(
            "https://api.elevenlabs.io/v1/speech-to-text",
            {
                method: "POST",
                headers: {
                    "xi-api-key": apiKey,
                },
                body: elevenForm,
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[STT] ElevenLabs API error:", response.status, errorText);
            return NextResponse.json(
                { error: `ElevenLabs STT error: ${response.status}` },
                { status: response.status }
            );
        }

        const result = await response.json();

        return NextResponse.json({
            text: result.text || "",
            language: result.language_code || null,
        });
    } catch (error) {
        console.error("[STT] Error:", error);
        return NextResponse.json(
            { error: "Failed to transcribe audio" },
            { status: 500 }
        );
    }
}
