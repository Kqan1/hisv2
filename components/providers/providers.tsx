import NextThemesProvider from "@/components/providers/next-themes-provider";
import { ModelProvider } from "@/components/providers/model-context";
import { Toaster } from "@/components/ui/sonner";

export default function Providers({ children }: { children: React.ReactNode; }) {
    return (
        <NextThemesProvider>
            <ModelProvider>
                { children }
                <Toaster richColors position="bottom-right" />
            </ModelProvider>
        </NextThemesProvider>
    );
};