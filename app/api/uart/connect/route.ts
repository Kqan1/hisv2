import { NextRequest, NextResponse } from 'next/server';
import { getUartService } from '@/services/uart.service';

/**
 * POST /api/uart/connect
 * Connect to a serial port and authenticate.
 * Body: { port: "/dev/cu.usbserial-110", baudRate?: 115200 }
 */
export async function POST(request: NextRequest) {
  try {
    const { port, baudRate } = await request.json();

    if (!port || typeof port !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid port path' }, { status: 400 });
    }

    const uart = getUartService();
    const result = await uart.connect(port.trim(), baudRate || 115200);

    // Auto-subscribe to all device streams (keys, letters, status)
    // so they flow through the SSE relay to the browser
    try {
      await uart.subscribeStream('all');
    } catch {
      // Non-fatal — device might not support streams or they may already be active
      console.warn('[UART] Failed to auto-subscribe to streams');
    }

    return NextResponse.json({
      success: true,
      ...result,
      port: port.trim(),
      state: uart.getConnectionState(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/uart/connect
 * Disconnect from the serial port.
 */
export async function DELETE() {
  try {
    const uart = getUartService();
    await uart.disconnect();
    return NextResponse.json({ success: true, state: 'disconnected' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Disconnect failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/uart/connect
 * Get current UART connection state.
 */
export async function GET() {
  const uart = getUartService();
  return NextResponse.json({
    state: uart.getConnectionState(),
    port: uart.getPortPath(),
    authenticated: uart.isAuthenticated(),
  });
}
