import { NextRequest, NextResponse } from 'next/server';

const ESP32_BASE_URL = 'http://192.168.10.204';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path?: string[] }> | { path?: string[] } }
) {
    const resolvedParams = await Promise.resolve(params);
    const path = (resolvedParams.path ?? []).join('/');

    if (!path) {
        return NextResponse.json({ error: 'Geçersiz yol' }, { status: 400 });
    }

    try {
        const response = await fetch(`${ESP32_BASE_URL}/${path}`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
        });

    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
        const data = await response.json();
        return NextResponse.json(data);
    }
    
    const text = await response.text();
    return new NextResponse(text, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'ESP32 bağlantı hatası' },
            { status: 503 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path?: string[] }> | { path?: string[] } }
) {
    const resolvedParams = await Promise.resolve(params);
    const path = (resolvedParams.path ?? []).join('/');
    const contentType = request.headers.get('content-type');

    if (!path) {
        return NextResponse.json({ error: 'Geçersiz yol' }, { status: 400 });
    }

    try {
        let body;
        if (contentType?.includes('application/json')) {
            body = await request.json();
        } else {
            body = await request.text();
        }

    const response = await fetch(`${ESP32_BASE_URL}/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': contentType || 'application/x-www-form-urlencoded',
        },
        body: contentType?.includes('application/json') 
            ? JSON.stringify(body) 
            : body,
        signal: AbortSignal.timeout(3000),
    });

    const responseContentType = response.headers.get('content-type');
    
    if (responseContentType?.includes('application/json')) {
        const data = await response.json();
        return NextResponse.json(data);
    }
    
    const text = await response.text();
    return new NextResponse(text, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'ESP32 bağlantı hatası' },
            { status: 503 }
        );
    }
}

export async function HEAD(
    request: NextRequest,
    { params }: { params: Promise<{ path?: string[] }> | { path?: string[] } }
) {
    const resolvedParams = await Promise.resolve(params);
    const path = (resolvedParams.path ?? []).join('/');

    if (!path) {
        return new NextResponse(null, { status: 400 });
    }

    try {
        const response = await fetch(`${ESP32_BASE_URL}/${path}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(2000),
        });

    return new NextResponse(null, { status: response.status });
    } catch {
        return new NextResponse(null, { status: 503 });
    }
}