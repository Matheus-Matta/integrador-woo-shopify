import { NextRequest, NextResponse } from 'next/server';
import { logEmitter, LogEvent, QueueEvent } from '@/lib/services/emitter';

export const dynamic = 'force-dynamic';

function sanitize(event: LogEvent | QueueEvent): Record<string, unknown> {
  const ev = { ...(event as unknown as Record<string, unknown>) };
  if (typeof ev['data'] === 'object' && ev['data'] !== null) {
    const data = { ...(ev['data'] as Record<string, unknown>) };
    delete data['payload'];
    delete data['response'];
    delete data['shopify_response'];
    delete data['stack'];
    ev['data'] = data;
  }
  return ev;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('dash_token')?.value;

  if (!token) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const onLog = (event: LogEvent | QueueEvent) => {
        const data = JSON.stringify(sanitize(event));
        controller.enqueue(`data: ${data}\n\n`);
      };

      logEmitter.on('log', onLog);
      logEmitter.on('queue', onLog);

      // Keep-alive ping a cada 30 segundos
      const pingInterval = setInterval(() => {
        controller.enqueue(`: ping\n\n`);
      }, 30_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
        logEmitter.off('log', onLog);
        logEmitter.off('queue', onLog);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Disable buffer for nginx/proxies if any
      'X-Accel-Buffering': 'no',
    },
  });
}
