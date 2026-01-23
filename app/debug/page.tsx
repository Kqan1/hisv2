'use client';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import Matrix from '@/components/ui/matrix';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { useESP32 } from '@/hooks/useESP32';
import { useESP32Connection } from '@/hooks/useESP32Connection';
import { Bug, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function Debug() {
    const { isConnected } = useESP32Connection();
    const { setArray, enableLoop, getStatus, runPattern, stop, setTiming } = useESP32();
    const MatrixTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRaiseAll, setIsRaiseAll] = useState<number[][]>();
    const [holdTime, setHoldTime] = useState<number>();
    const [offTime, setOffTime] = useState<number>();
    
    const handleAutoSave = (data: number[][]) => {
        // Önceki zamanlayıcıyı temizle (Debounce)
        if (MatrixTimerRef.current) clearTimeout(MatrixTimerRef.current);
        
        // 1 saniye sonra API'ye gönder
        MatrixTimerRef.current = setTimeout(async () => {
            setArray(data, { cycle: true });
            console.log("sended:", data);
        }, 1000);
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const status = await getStatus();
            setHoldTime(status.holdTime)
            setOffTime(status.offTime)
            setLoopEnabled(status.loopEnabled)
            console.log("✅ Status refreshed:", status);
        } catch (error) {
            console.error("❌ Refresh failed:", error);
        } finally {
            setIsRefreshing(false);
        };
    };

    useEffect(()=>{handleRefresh()}, [])

    useEffect(() => {
        // Değerler henüz yüklenmediyse (undefined ise) veya 0 ise işlem yapma
        if (!holdTime || !offTime) return;

        // 1 saniyelik bir sayaç başlat
        const timer = setTimeout(() => {
            console.log("⏳ Autosave: Timing sending...", holdTime, offTime);
            setTiming(holdTime, offTime);
        }, 1000);

        // CLEANUP FONKSİYONU:
        // Eğer 1 saniye dolmadan holdTime veya offTime tekrar değişirse,
        // React bu return fonksiyonunu çalıştırır ve önceki sayacı iptal eder.
        // Böylece sadece son değer için API isteği atılır.
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
            <div className="flex justify-between items-center border">
                <div className="flex items-center gap-2">
                    <h3 className="font-medium">Connection Status:</h3> 
                    <ConnectionIndicator className="p-0!" />
                </div>
                <Button 
                    size="icon" 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    <RotateCw className={isRefreshing ? 'animate-spin' : ''} />
                </Button>
            </div>

            {/* Functions */}
            <div className="flex flex-col gap-2">
                <h3 className="font-medium">Functions:</h3>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={stop}
                        disabled={!isConnected}
                    >
                        Stop
                    </Button>
                    <Button
                        onClick={async () => {
                            const newState = !loopEnabled;
                            await enableLoop(newState);
                            setLoopEnabled(newState);
                        }}
                        disabled={!isConnected}
                    >
                        {loopEnabled ? "Disable Loop" : "Enable Loop"}
                    </Button>
                    <Button
                        onClick={ async () => {
                            setArray(Array(10).fill(1).map(() => Array(15).fill(1)), { cycle: true });
                            setIsRaiseAll(Array(10).fill(1).map(() => Array(15).fill(1)));
                            enableLoop(true)
                            setLoopEnabled(true)
                        }}
                        disabled={!isConnected}
                    >
                        Raise All
                    </Button>
                </div>
            </div>

            {/* Matrix */}
            <Matrix onChange={handleAutoSave} initialData={isRaiseAll} />

            {/* Patterns */}
            <div className="grid grid-cols-3 grid-rows-2 gap-1">
            {[
                { name: 'Wave', value: 'wave' },
                { name: 'Spiral', value: 'spiral' },
                { name: 'Checkerboard', value: 'checkerboard' },
                { name: 'Horizontal', value: 'horizontal' },
                { name: 'Vertical', value: 'vertical' },
                { name: 'Diagonal', value: 'diagonal' },
                //{ name: 'Raise All', value: 'raiseall' },
                //{ name: 'Lower All', value: 'lowerall' }
            ].map(({ name, value }) => (
                <Button
                    key={value}
                    onClick={() => runPattern(value as any)}
                    disabled={!isConnected}
                >
                    {name}
                </Button>
                ))}
            </div>

            {/*Timing Configuration */}
            { (holdTime !== undefined && offTime !== undefined) ? (
                <div className="flex flex-col gap-2 !pb-4">
                    <h3 className="font-medium">Timing Configuration</h3>
                    <div className="space-y-2">
                        <h3 className="font-medium">Hold Time: {holdTime}</h3>
                        <Slider 
                            defaultValue={[holdTime]}
                            max={50}
                            min={1}
                            step={1}
                            disabled={!isConnected}
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
                            disabled={!isConnected}
                            onValueChange={(value) => setOffTime(value[0])}
                        />
                    </div>
                </div>) : ( <TimingConfigurationSkeleton /> )
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