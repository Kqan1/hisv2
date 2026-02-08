'use client';
import { useESP32Connection } from '@/hooks/useESP32Connection';
import { cn } from '@/lib/utils';

const DISABLE_CONNECTION_INDICATOR = true; // 👈 geçici kapatma

export function ConnectionIndicator({ className, ...props }: { className?: string }) {

    if (DISABLE_CONNECTION_INDICATOR) return null; // 👈 tamamen kapalı

    const { state, isConnected } = useESP32Connection();

    const statusConfig = {
        connected: { color: 'bg-green-100 text-green-800', dot: 'bg-green-500 animate-pulse', text: 'Connected' },
        checking: { color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500 animate-pulse', text: 'Checking...' },
        disconnected: { color: 'bg-red-100 text-red-800', dot: 'bg-red-500', text: 'Disconnected' }
    };

    const config = statusConfig[state];

    return (
        <div className={cn(`flex items-center gap-2 px-4 py-2 rounded-lg !bg-transparent ${config.color}`, className, props)}>
            <div className={`size-3 rounded-full ${config.dot}`} />
            <span className="text-md font-medium">{config.text}</span>
        </div>
    );
}
