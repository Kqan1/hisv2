import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "ELEVENLABS_API_KEY is not set" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { text, voiceId } = body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json(
                { error: "No text provided" },
                { status: 400 }
            );
        }

        // Default voice: Rachel (multilingual, clear)
        const voice = voiceId || 'ljX1ZrXuDIIRVcmiVSyR';

        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify({
                    text: text.substring(0, 5000), // ElevenLabs has a char limit
                    model_id: 'eleven_v3',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[TTS] ElevenLabs API error:", response.status, errorText);
            return NextResponse.json(
                { error: `ElevenLabs API error: ${response.status}` },
                { status: response.status }
            );
        }

        // Stream the audio response back
        const audioBuffer = await response.arrayBuffer();
        return new NextResponse(audioBuffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.byteLength.toString(),
            },
        });
    } catch (error) {
        console.error("[TTS] Error:", error);
        return NextResponse.json(
            { error: "Failed to generate speech" },
            { status: 500 }
        );
    }
}
