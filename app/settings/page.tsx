'use client';

import ThemeToggle from "@/components/themeToggle";
import { Heading } from "@/components/ui/heading";
import { SettingsIcon, CheckCircle2 } from "lucide-react";
import { useModel } from "@/components/providers/model-context";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
    const { activeModel, setActiveModel, models } = useModel();

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

            {/* Theme */}
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Appearance</h3>
                <ThemeToggle />
            </div>
        </div>
    );
}