import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { BrainCircuit, Send } from 'lucide-react';

export default function AITeacher() {
    return (
        <div className="h-full flex flex-col space-y-4">
            <Heading 
                title="AI Teacher" 
                description="You can chat with the AI teacher here" 
                Icon={<BrainCircuit className="size-6" />} 
            />
            
            <div className="flex-1 flex flex-col space-y-2 min-h-0">
                <div className="flex-1 border-dashed border rounded p-2 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-muted-foreground">12:00</span>
                        <div className="bg-muted p-2 rounded-md w-full">
                            <span className="text-sm font-bold block">You</span>
                            <span className="text-sm">Hi, can you draw a triangle?</span>
                        </div>
                    </div>
                    <div className="text-center text-muted-foreground">Teacher is thinking...</div>
                </div>

                <div className="flex items-center gap-2">
                    <Input placeholder="Ask the AI teacher a question" className="w-full" disabled />
                    <Button variant="outline" size="icon" disabled>
                        <Send className="size-4"/>
                    </Button>
                </div>
            </div>
        </div>
    );
};