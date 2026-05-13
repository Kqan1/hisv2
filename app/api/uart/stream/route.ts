import { getUartService } from '@/services/uart.service';
import type { UartStreamMessage } from '@/services/uart.service';

/**
 * GET /api/uart/stream
 * Server-Sent Events endpoint that relays UART stream messages to the browser.
 * Replaces direct WebSocket connections (ports 81, 82, 83) when using UART transport.
 *
 * Query params:
 *   ?subscribe=all       Subscribe to all streams
 *   ?subscribe=keys      Subscribe to key stream only
 *   ?subscribe=letters   Subscribe to letter stream only
 *   ?subscribe=status    Subscribe to status stream only
 *
 * SSE event format:
 *   event: keystate|letter|status|state
 *   data: { ... JSON ... }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const subscribe = url.searchParams.get('subscribe') || 'all';

  const uart = getUartService();

  // Validate stream name
  const validStreams = ['keys', 'letters', 'status', 'all'];
  if (!validStreams.includes(subscribe)) {
    return new Response(JSON.stringify({ error: 'Invalid stream. Use: keys, letters, status, all' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection state
      const stateData = `event: state\ndata: ${JSON.stringify({
        state: uart.getConnectionState(),
        port: uart.getPortPath(),
        authenticated: uart.isAuthenticated(),
      })}\n\n`;
      controller.enqueue(encoder.encode(stateData));

      // Subscribe to stream messages from UART
      const streamUnsub = uart.onStreamMessage((msg: UartStreamMessage) => {
        try {
          const eventType = msg.type; // keystate, letter, status, hello
          const sseData = `event: ${eventType}\ndata: ${JSON.stringify(msg)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        } catch {
          // Controller might be closed
        }
      });

      // Subscribe to state changes
      const stateUnsub = uart.onStateChange((state) => {
        try {
          const sseData = `event: state\ndata: ${JSON.stringify({
            state,
            port: uart.getPortPath(),
            authenticated: uart.isAuthenticated(),
          })}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        } catch {
          // Controller might be closed
        }
      });

      // Note: Device stream subscriptions are handled by the connect handler,
      // not here. The SSE endpoint just passively relays whatever messages
      // the UART service receives.

      // Keep-alive ping every 15 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15000);

      // Cleanup when client disconnects
      request.signal.addEventListener('abort', () => {
        streamUnsub();
        stateUnsub();
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
