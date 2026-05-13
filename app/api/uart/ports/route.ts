import { NextResponse } from 'next/server';
import { getUartService } from '@/services/uart.service';

/**
 * GET /api/uart/ports
 * Returns available serial ports on the system.
 */
export async function GET() {
  try {
    const uart = getUartService();
    const ports = await uart.listPorts();
    return NextResponse.json({ ports });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list ports: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
