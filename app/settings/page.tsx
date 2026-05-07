'use client';

import ThemeToggle from "@/components/themeToggle";
import { Heading } from "@/components/ui/heading";
import { SettingsIcon, CheckCircle2, BatteryCharging, Wifi, Loader2, Zap } from "lucide-react";
import { useModel } from "@/components/providers/model-context";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { useESP32 } from "@/hooks/useESP32";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Settings() {
    const { activeModel, setActiveModel, models } = useModel();
    const { setPowerSave, getPowerSave, setIp, getIp, setLatching, onStatus, getLastStatus } = useESP32();
    const [powerSave, setPowerSaveState] = useState(getPowerSave());
    const [ip, setIpState] = useState(getIp() || '');
    const [savingIp, setSavingIp] = useState(false);

    // Update mode: 'off' | 'down' | 'up' | 'both'
    const [updateMode, setUpdateMode] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('esp32_update_mode') || 'off';
        }
        return 'off';
    });

    // Sync update mode from device status on mount
    useEffect(() => {
        const last = getLastStatus();
        if (last) {
            const mode = last.updateOnly
                ? last.updateOnlyDir === 1 ? 'down' : last.updateOnlyDir === 2 ? 'up' : 'both'
                : 'off';
            setUpdateMode(mode);
            localStorage.setItem('esp32_update_mode', mode);
        }

        const unsub = onStatus((status) => {
            const mode = status.updateOnly
                ? status.updateOnlyDir === 1 ? 'down' : status.updateOnlyDir === 2 ? 'up' : 'both'
                : 'off';
            setUpdateMode(mode);
            localStorage.setItem('esp32_update_mode', mode);
        });
        return () => { unsub(); };
    }, [onStatus, getLastStatus]);

    const handleUpdateModeChange = async (mode: string) => {
        setUpdateMode(mode);
        localStorage.setItem('esp32_update_mode', mode);
        try {
            if (mode === 'off') {
                await setLatching({ updateOnly: false });
            } else {
                const dir = mode === 'down' ? 1 : mode === 'up' ? 2 : 0;
                await setLatching({ updateOnly: true, updateOnlyDir: dir });
            }
            toast.success(`Update mode: ${mode === 'off' ? 'Off' : mode === 'down' ? 'Down pull only' : mode === 'up' ? 'Up pull only' : 'Both directions'}`);
        } catch {
            toast.error('Failed to update mode');
        }
    };

    const handleIpSave = async () => {
        const trimmed = (ip || '').trim();
        if (!trimmed) {
            toast.error('IP address cannot be empty');
            return;
        }
        setSavingIp(true);
        try {
            // Update client-side ESP32 service
            setIp(trimmed);
            // Update server-side proxy
            await fetch('/api/esp32/ip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: trimmed }),
            });
            toast.success(`Device IP updated to ${trimmed}`);
        } catch {
            toast.error('Failed to update IP');
        } finally {
            setSavingIp(false);
        }
    };

    return (
        <div className="space-y-6">
            <Heading title="Settings" description="You can change configure your settings here" Icon={<SettingsIcon size={42} />} />

            {/* Device Model Selection */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Device Model</h3>
                <div className="grid grid-cols-2 gap-3">
                    {models.map((model) => {
                        const isActive = activeModel.id === model.id;
                        return (
                            <button
                                key={model.id}
                                onClick={() => setActiveModel(model.id)}
                                className={cn(
                                    "relative flex flex-col items-center rounded-xl border p-3 text-center transition-all duration-200",
                                    "hover:shadow-lg hover:border-primary/50 hover:-translate-y-0.5",
                                    isActive
                                        ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/30"
                                        : "border-border bg-card hover:bg-accent/30"
                                )}
                            >
                                {/* Selection indicator */}
                                {isActive && (
                                    <div className="absolute top-2 right-2">
                                        <CheckCircle2 className="size-5 text-primary" />
                                    </div>
                                )}

                                {/* Device Image */}
                                <div className="w-full aspect-square rounded-lg bg-muted/30 overflow-hidden mb-3 flex items-center justify-center">
                                    {model.image ? (
                                        <Image
                                            src={model.image}
                                            alt={model.name}
                                            width={200}
                                            height={200}
                                            className="object-contain w-full h-full p-2"
                                        />
                                    ) : (
                                        <div className="text-muted-foreground/30 text-3xl font-bold">
                                            {model.name.charAt(0)}
                                        </div>
                                    )}
                                </div>

                                {/* Model Info */}
                                <div className="flex flex-col items-center gap-1">
                                    <span className="font-semibold text-sm">{model.name}</span>
                                    {model.description && (
                                        <Badge variant="secondary">{model.description}</Badge>
                                    )}
                                    <span className="text-xs text-muted-foreground font-mono mt-1">
                                        {model.rows} × {model.cols}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Device IP */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Device Connection</h3>
                <div className="rounded-xl border p-3 bg-card space-y-2">
                    <div className="flex items-center gap-2">
                        <Wifi size={16} className="text-muted-foreground" />
                        <span className="text-sm font-semibold">Device IP</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={ip || ''}
                            onChange={(e) => setIpState(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleIpSave(); }}
                            placeholder="e.g. 192.168.4.1"
                            className={cn(
                                "h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono",
                                "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            )}
                        />
                        <Button
                            size="sm"
                            className="shrink-0 h-8"
                            onClick={handleIpSave}
                            disabled={savingIp || (ip || '').trim() === getIp()}
                        >
                            {savingIp ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Display */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Display</h3>
                <div className="flex items-center justify-between rounded-xl border p-3 bg-card">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold">Power Save Mode</span>
                        <span className="text-xs text-muted-foreground">
                            Disable loop power after pulling all pixels down. Re-engages on content change.
                        </span>
                    </div>
                    <Toggle
                        pressed={powerSave}
                        onPressedChange={(pressed) => {
                            setPowerSave(pressed);
                            setPowerSaveState(pressed);
                        }}
                        variant="outline"
                        className="gap-2"
                    >
                        <BatteryCharging size={16} className={powerSave ? "text-green-500" : "text-muted-foreground"} />
                        {powerSave ? "On" : "Off"}
                    </Toggle>
                </div>

                {/* Update Mode */}
                <div className="rounded-xl border p-3 bg-card space-y-2">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <Zap size={16} className="text-muted-foreground" />
                            <span className="text-sm font-semibold">Update Mode</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            Controls which pixel directions are actuated on every refresh vs. only on change.
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { value: 'off', label: 'Off', desc: 'Refresh all' },
                            { value: 'down', label: 'Down Only', desc: 'Down on change' },
                            { value: 'up', label: 'Up Only', desc: 'Up on change' },
                            { value: 'both', label: 'Both', desc: 'All on change' },
                        ].map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => handleUpdateModeChange(opt.value)}
                                className={cn(
                                    "flex flex-col items-center rounded-lg border p-2 text-center transition-all duration-200",
                                    updateMode === opt.value
                                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border hover:bg-accent/30"
                                )}
                            >
                                <span className="text-xs font-semibold">{opt.label}</span>
                                <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Theme */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Appearance</h3>
                <ThemeToggle />
            </div>
        </div>
    );
}