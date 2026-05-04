import { NextRequest, NextResponse } from 'next/server';
import { getEsp32Ip, setEsp32Ip } from '@/lib/esp32-ip';

export async function GET() {
    return NextResponse.json({ ip: getEsp32Ip() });
}

export async function POST(request: NextRequest) {
    try {
        const { ip } = await request.json();
        if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
            return NextResponse.json({ error: 'Invalid IP' }, { status: 400 });
        }
        setEsp32Ip(ip.trim());
        return NextResponse.json({ ip: ip.trim(), success: true });
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
