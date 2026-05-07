import { Button } from "@/components/ui/button";
import { Keyboard } from "lucide-react";
import { KeyState } from "@/hooks/useBrailleKeyboard";

const KEY_LABELS = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'] as const;
const BRAILLE_DOT_LABELS = ['1', '2', '3', '7', '4', '5', '6', '8'] as const;

interface BrailleKeyboardStateProps {
    typedText: string;
    keyState: KeyState;
    onClearText?: () => void;
}

export function BrailleKeyboardState({ typedText, keyState, onClearText }: BrailleKeyboardStateProps) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center w-full">
                <div className="flex items-center gap-2 w-full flex-1">
                    <div className="bg-secondary text-secondary-foreground text-sm px-3 py-1.5 rounded-md flex items-center gap-2 font-mono w-full">
                        <Keyboard size={16} />
                        {typedText ? (
                            <span className="truncate">{typedText.replace(/\n/g, '↵')}</span>
                        ) : (
                            <span className="text-muted-foreground italic">Type using braille keyboard...</span>
                        )}
                    </div>
                    {typedText && onClearText && (
                        <Button variant="ghost" size="sm" onClick={onClearText}>
                            Clear Text
                        </Button>
                    )}
                </div>
            </div>
            
            <div className="flex flex-col items-center p-4 bg-muted/20 border rounded-lg">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Live Keyboard State</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
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
                    className={`flex items-center justify-center rounded-lg border-2 transition-all duration-75 h-10 w-full max-w-sm mt-3 ${
                        keyState.spacebar
                            ? 'bg-primary text-primary-foreground border-primary shadow-md'
                            : 'bg-muted/30 text-muted-foreground border-border'
                    }`}
                >
                    <span className="text-sm font-bold">SPACEBAR</span>
                </div>
            </div>
        </div>
    );
}
