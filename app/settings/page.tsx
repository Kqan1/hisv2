'use client';

import ThemeToggle from "@/components/themeToggle";
import { Heading } from "@/components/ui/heading";
import { SettingsIcon, CheckCircle2, BatteryCharging, Wifi, Loader2 } from "lucide-react";
import { useModel } from "@/components/providers/model-context";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { useESP32 } from "@/hooks/useESP32";
import { useState } from "react";
import { toast } from "sonner";

export default function Settings() {
    const { activeModel, setActiveModel, models } = useModel();
    const { setPowerSave, getPowerSave, setIp, getIp } = useESP32();
    const [powerSave, setPowerSaveState] = useState(getPowerSave());
    const [ip, setIpState] = useState(getIp());
    const [savingIp, setSavingIp] = useState(false);

    const handleIpSave = async () => {
        const trimmed = ip.trim();
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
                <div className="flex items-center justify-between rounded-xl border p-3 bg-card gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Wifi size={18} className="text-muted-foreground shrink-0" />
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className="text-sm font-semibold">Device IP</span>
                            <input
                                type="text"
                                value={ip}
                                onChange={(e) => setIpState(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleIpSave(); }}
                                placeholder="e.g. 192.168.4.1"
                                className={cn(
                                    "h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-mono",
                                    "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                                )}
                            />
                        </div>
                    </div>
                    <Button
                        size="sm"
                        onClick={handleIpSave}
                        disabled={savingIp || ip.trim() === getIp()}
                    >
                        {savingIp ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                    </Button>
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
            </div>

            {/* Theme */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Appearance</h3>
                <ThemeToggle />
            </div>
        </div>
    );
}