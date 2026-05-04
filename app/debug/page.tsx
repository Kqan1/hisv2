'use client';
import { useModel } from '@/components/providers/model-context';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import Matrix from '@/components/ui/matrix';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { useESP32 } from '@/hooks/useESP32';
import { useESP32Connection } from '@/hooks/useESP32Connection';
import { Bug, Keyboard, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// ========================================================================
// KEYBOARD DEBUG COMPONENT
// ========================================================================

const KEY_LABELS = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'] as const;
const BRAILLE_DOT_LABELS = ['1', '2', '3', '7', '4', '5', '6', '8'] as const;

type KeyState = {
    keys: number;
    spacebar: boolean;
    dots: number[];
};

function KeyboardDebug() {
    const [keyWsStatus, setKeyWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [letterWsStatus, setLetterWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [keyState, setKeyState] = useState<KeyState>({ keys: 0, spacebar: false, dots: [0, 0, 0, 0, 0, 0, 0, 0] });
    const [letterLog, setLetterLog] = useState<string[]>([]);
    const [typedText, setTypedText] = useState('');
    const keyWsRef = useRef<WebSocket | null>(null);
    const letterWsRef = useRef<WebSocket | null>(null);

    const { getIp } = useESP32();
    const esp32Ip = getIp();

    const connectKeyWs = useCallback(() => {
        if (keyWsRef.current?.readyState === WebSocket.OPEN) return;
        setKeyWsStatus('connecting');
        try {
            const ws = new WebSocket(`ws://${esp32Ip}:81/`);
            ws.onopen = () => {
                console.log('Key WebSocket connected');
                setKeyWsStatus('connected');
            };
            ws.onclose = () => {
                console.log('Key WebSocket disconnected');
                setKeyWsStatus('disconnected');
            };
            ws.onerror = (error) => {
                console.error('Key WebSocket error:', error);
                setKeyWsStatus('disconnected');
            };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    console.log('Key WebSocket message:', msg);
                    if (msg.type === 'keystate') {
                        setKeyState({ keys: msg.keys, spacebar: msg.spacebar, dots: msg.dots });
                    }
                } catch (err) {
                    console.error('Key WebSocket parse error:', err);
                }
            };
            keyWsRef.current = ws;
        } catch {
            setKeyWsStatus('disconnected');
        }
    }, [esp32Ip]);

    const connectLetterWs = useCallback(() => {
        if (letterWsRef.current?.readyState === WebSocket.OPEN) return;
        setLetterWsStatus('connecting');
        try {
            const ws = new WebSocket(`ws://${esp32Ip}:82/`);
            ws.onopen = () => {
                console.log('Letter WebSocket connected');
                setLetterWsStatus('connected');
            };
            ws.onclose = () => {
                console.log('Letter WebSocket disconnected');
                setLetterWsStatus('disconnected');
            };
            ws.onerror = (error) => {
                console.error('Letter WebSocket error:', error);
                setLetterWsStatus('disconnected');
            };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    console.log('Letter WebSocket message:', msg);
                    if (msg.type === 'letter') {
                        const entry = `${msg.letter} (dots: ${msg.dotString})`;
                        setLetterLog(prev => [entry, ...prev].slice(0, 30));
                        setTypedText(prev => prev + msg.letter);
                    }
                } catch (err) {
                    console.error('Letter WebSocket parse error:', err);
                }
            };
            letterWsRef.current = ws;
        } catch {
            setLetterWsStatus('disconnected');
        }
    }, [esp32Ip]);

    useEffect(() => {
        return () => {
            keyWsRef.current?.close();
            letterWsRef.current?.close();
        };
    }, []);

    const WsStatusDot = ({ status }: { status: string }) => (
        <span className={`inline-block size-2 rounded-full ${
            status === 'connected' ? 'bg-green-500' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
        }`} />
    );

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                    <Keyboard size={18} /> Keyboard Debug
                </h3>
            </div>

            {/* WebSocket connections */}
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    variant={keyWsStatus === 'connected' ? 'secondary' : 'outline'}
                    onClick={keyWsStatus === 'connected' ? () => { keyWsRef.current?.close(); } : connectKeyWs}
                    className="gap-2 text-xs"
                >
                    <WsStatusDot status={keyWsStatus} />
                    {keyWsStatus === 'connected' ? 'Keys: Connected' : 'Connect Keys (:81)'}
                </Button>
                <Button
                    size="sm"
                    variant={letterWsStatus === 'connected' ? 'secondary' : 'outline'}
                    onClick={letterWsStatus === 'connected' ? () => { letterWsRef.current?.close(); } : connectLetterWs}
                    className="gap-2 text-xs"
                >
                    <WsStatusDot status={letterWsStatus} />
                    {letterWsStatus === 'connected' ? 'Letters: Connected' : 'Connect Letters (:82)'}
                </Button>
            </div>

            {/* Key state visualizer */}
            <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-mono">Raw bitmask: {keyState.keys}</p>
                <div className="flex flex-wrap gap-1.5">
                    {KEY_LABELS.map((label, i) => (
                        <div
                            key={label}
                            className={`flex flex-col items-center justify-center rounded-lg border-2 transition-all duration-75 min-w-[44px] h-12 ${
                                keyState.dots[i]
                                    ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-md'
                                    : 'bg-muted/30 text-muted-foreground border-border'
                            }`}
                        >
                            <span className="text-sm font-bold">{label}</span>
                            <span className="text-[10px] opacity-60">dot {BRAILLE_DOT_LABELS[i]}</span>
                        </div>
                    ))}
                </div>
                <div
                    className={`flex items-center justify-center rounded-lg border-2 transition-all duration-75 h-10 ${
                        keyState.spacebar
                            ? 'bg-primary text-primary-foreground border-primary shadow-md'
                            : 'bg-muted/30 text-muted-foreground border-border'
                    }`}
                >
                    <span className="text-sm font-bold">SPACEBAR</span>
                </div>
            </div>

            <Separator />

            {/* Decoded letters */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Typed Output</p>
                    {typedText.length > 0 && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setTypedText(''); setLetterLog([]); }}>
                            Clear
                        </Button>
                    )}
                </div>
                <div className="bg-muted/40 rounded-lg p-3 min-h-[40px] font-mono text-lg break-all border border-border/50">
                    {typedText || <span className="text-muted-foreground text-sm italic">Waiting for input...</span>}
                </div>
                {letterLog.length > 0 && (
                    <details className="text-xs">
                        <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                            Letter log ({letterLog.length} entries)
                        </summary>
                        <div className="mt-1 max-h-32 overflow-y-auto font-mono space-y-0.5 text-muted-foreground">
                            {letterLog.map((entry, i) => (
                                <div key={i}>{entry}</div>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}

// ========================================================================
// MAIN DEBUG PAGE
// ========================================================================

export default function Debug() {
    const { isConnected } = useESP32Connection();
    const { setArray, enableLoop, stop, setTiming, onStatus, getLastStatus } = useESP32();
    const { activeModel } = useModel();
    const MatrixTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [isRaiseAll, setIsRaiseAll] = useState<number[][]>();
    const [holdTime, setHoldTime] = useState<number>();
    const [offTime, setOffTime] = useState<number>();
    const [uptime, setUptime] = useState<number>();
    const [freeHeap, setFreeHeap] = useState<number>();
    const [wifiRssi, setWifiRssi] = useState<number>();
    const timingUserEdit = useRef(false);

    const handleAutoSave = (data: number[][]) => {
        // Önceki zamanlayıcıyı temizle (Debounce)
        if (MatrixTimerRef.current) clearTimeout(MatrixTimerRef.current);

        // 1 saniye sonra API'ye gönder
        MatrixTimerRef.current = setTimeout(async () => {
            setArray(data, { cycle: true });
            console.log("sended:", data);
        }, 1000);
    };

    // Subscribe to real-time status via WebSocket (port 83)
    useEffect(() => {
        // Seed from last known status if available
        const last = getLastStatus();
        if (last) {
            setHoldTime(prev => prev ?? last.pixelOnTime);
            setOffTime(prev => prev ?? last.pixelOffTime);
            setLoopEnabled(prev => prev ?? last.loopEnabled);
            setUptime(prev => prev ?? last.uptime);
            setFreeHeap(prev => prev ?? last.freeHeap);
            setWifiRssi(prev => prev ?? last.wifiRssi);
        }

        const unsub = onStatus((status) => {
            console.log("Real status from socket:", status.uptime);
            // Only update timing from device if user is NOT actively editing
            if (!timingUserEdit.current) {
                setHoldTime(status.pixelOnTime);
                setOffTime(status.pixelOffTime);
            }
            setLoopEnabled(status.loopEnabled);
            setUptime(status.uptime);
            setFreeHeap(status.freeHeap);
            setWifiRssi(status.wifiRssi);
        });

        return unsub;
    }, [onStatus, getLastStatus]);

    // Local uptime ticker to make it look smooth (1s increments)
    // while real data comes every 5s from the device
    useEffect(() => {
        const interval = setInterval(() => {
            if (isConnected) {
                setUptime(prev => (prev !== undefined ? prev + 1 : prev));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isConnected]);

    useEffect(() => {
        // Değerler henüz yüklenmediyse (undefined ise) veya 0 ise işlem yapma
        if (!holdTime || !offTime) return;

        // Mark as user edit so WebSocket status doesn't overwrite
        timingUserEdit.current = true;

        // 1 saniyelik bir sayaç başlat
        const timer = setTimeout(() => {
            console.log("Autosave: Timing sending...", holdTime, offTime);
            setTiming(holdTime, offTime);
            // After send, allow status updates again
            setTimeout(() => { timingUserEdit.current = false; }, 2000);
        }, 1000);

        return () => clearTimeout(timer);
    }, [holdTime, offTime, setTiming]);

    return (
        <div className="flex flex-col gap-2 *:p-2 *:border-dashed *:border *:rounded">
            <Heading
                title="Debug"
                description="Debug Menu for Developers"
                Icon={<Bug size={42} />}
                className="border-0!"
            />

            {/* Connection Status */}
            <div className="flex flex-col gap-1 border">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium">Connection Status:</h3>
                    <ConnectionIndicator className="p-0!" />
                </div>
                {(uptime !== undefined || freeHeap !== undefined || wifiRssi !== undefined) && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                        {uptime !== undefined && (
                            <span>⏱ {Math.floor(uptime / 60)}m {uptime % 60}s</span>
                        )}
                        {freeHeap !== undefined && (
                            <span>{(freeHeap / 1024).toFixed(0)}KB free</span>
                        )}
                        {wifiRssi !== undefined && wifiRssi !== 0 && (
                            <span>{wifiRssi} dBm</span>
                        )}
                    </div>
                )}
            </div>

            {/* Functions */}
            <div className="flex flex-col gap-2">
                <h3 className="font-medium">Functions:</h3>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={stop}
                    >
                        Stop
                    </Button>
                    <Button
                        onClick={async () => {
                            const newState = !loopEnabled;
                            await enableLoop(newState);
                            setLoopEnabled(newState);
                        }}
                    >
                        {loopEnabled ? "Disable Loop" : "Enable Loop"}
                    </Button>
                    <Button
                        onClick={async () => {
                            setArray(Array(activeModel.rows).fill(1).map(() => Array(activeModel.cols).fill(1)), { cycle: true });
                            setIsRaiseAll(Array(activeModel.rows).fill(1).map(() => Array(activeModel.cols).fill(1)));
                            enableLoop(true)
                            setLoopEnabled(true)
                        }}
                    >
                        Raise All
                    </Button>
                </div>
            </div>

            {/* Matrix */}
            <Matrix onChange={handleAutoSave} initialData={isRaiseAll} />

            {/* Keyboard Debug */}
            <KeyboardDebug />

            {/*Timing Configuration */}
            {(holdTime !== undefined && offTime !== undefined) ? (
                <div className="flex flex-col gap-2 !pb-4">
                    <h3 className="font-medium">Timing Configuration</h3>
                    <div className="space-y-2">
                        <h3 className="font-medium">Hold Time: {holdTime}</h3>
                        <Slider
                            defaultValue={[holdTime]}
                            max={10000}
                            min={1}
                            step={1}
                                onValueChange={(value) => setHoldTime(value[0])}
                        />
                    </div>
                    <Separator className="my-2" />
                    <div className="space-y-2">
                        <h3 className="font-medium">Off Time: {offTime}</h3>
                        <Slider
                            defaultValue={[offTime]}
                            max={10}
                            min={1}
                            step={1}
                                onValueChange={(value) => setOffTime(value[0])}
                        />
                    </div>
                </div>) : (<TimingConfigurationSkeleton />)
            }
        </div>
    );
};


const TimingConfigurationSkeleton = () => {
    return (
        <div className="p-4 space-y-4">
            <Skeleton className="w-70 h-8" />
            <div className="space-y-1">
                <div className="flex gap-2">
                    <Skeleton className="w-32 h-6" /> <Skeleton className="w-16 h-6" />
                </div>
                <Skeleton className="w-full h-4" />
            </div>

            <div className="space-y-1">
                <div className="flex gap-2">
                    <Skeleton className="w-32 h-6" /> <Skeleton className="w-16 h-6" />
                </div>
                <Skeleton className="w-full h-4" />
            </div>
        </div>
    );
};