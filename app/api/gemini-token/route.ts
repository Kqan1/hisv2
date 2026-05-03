import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

/**
 * POST /api/gemini-token
 * 
 * Generates an ephemeral token for the Gemini Live API.
 * This keeps the API key server-side while allowing the browser
 * to connect directly to the Live API via WebSocket.
 */
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const token = await ai.authTokens.create({
      uses: 1, // Single-use token
      expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    });

    return NextResponse.json({
      token: token.name,
    });
  } catch (error) {
    console.error('Failed to create ephemeral token:', error);
    return NextResponse.json(
      { error: 'Failed to create ephemeral token' },
      { status: 500 }
    );
  }
}
