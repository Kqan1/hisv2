import { NextRequest, NextResponse } from 'next/server';
import { getUartService } from '@/services/uart.service';

/**
 * POST /api/uart/command
 * Send a UART command and return the response.
 *
 * Body options:
 * 1. Direct UART format:  { action: "display", pixels: [...] }
 * 2. Proxy-compatible:    { endpoint: "/api/display", body: { password: "...", pixels: [...] } }
 *
 * When ESP32Service uses UART transport, it sends commands in format #2
 * so we can map HTTP endpoints to UART actions automatically.
 */

// Maps HTTP endpoint paths to UART action names + parameter transforms
const ENDPOINT_TO_ACTION: Record<string, {
  action: string;
  mapParams?: (body: Record<string, unknown>) => Record<string, unknown>;
}> = {
  '/api/display': {
    action: 'display',
    mapParams: (body) => ({ pixels: body.pixels }),
  },
  '/api/loop': {
    action: 'loop',
    mapParams: (body) => ({ enabled: body.enabled }),
  },
  '/api/timing': {
    action: 'timing',
    mapParams: (body) => ({
      pixelOnTime: body.pixelOnTime,
      pixelOffTime: body.pixelOffTime,
    }),
  },
  '/api/latching': {
    action: 'latching',
    mapParams: (body) => {
      const { password, ...rest } = body;
      return rest;
    },
  },
  '/api/stop': {
    action: 'stop',
  },
  '/api/status': {
    action: 'status',
  },
  '/api/public': {
    action: '', // Determined from body.action
    mapParams: (body) => {
      // /api/public carries its own action field (clear, pixel, etc.)
      const { user, pass, action, ...rest } = body;
      return rest;
    },
  },
};

export async function POST(request: NextRequest) {
  try {
    const uart = getUartService();

    if (uart.getConnectionState() !== 'connected') {
      return NextResponse.json(
        { success: false, error: 'UART not connected' },
        { status: 503 }
      );
    }

    const body = await request.json();

    let action: string;
    let params: Record<string, unknown>;

    // Format #2: proxy-compatible with endpoint mapping
    if (body.endpoint && typeof body.endpoint === 'string') {
      const mapping = ENDPOINT_TO_ACTION[body.endpoint];
      if (!mapping) {
        return NextResponse.json(
          { success: false, error: `Unknown endpoint: ${body.endpoint}` },
          { status: 400 }
        );
      }

      const reqBody = (body.body || {}) as Record<string, unknown>;

      // For /api/public, the action comes from the body
      if (body.endpoint === '/api/public') {
        action = (reqBody.action as string) || 'clear';
      } else {
        action = mapping.action;
      }

      params = mapping.mapParams ? mapping.mapParams(reqBody) : {};
    }
    // Format #1: direct UART command
    else if (body.action && typeof body.action === 'string') {
      const { action: act, ...rest } = body;
      action = act;
      params = rest;
    } else {
      return NextResponse.json(
        { success: false, error: 'Missing action or endpoint' },
        { status: 400 }
      );
    }

    const response = await uart.sendCommand(action, params);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Command failed' },
      { status: 500 }
    );
  }
}
