import NextThemesProvider from "@/components/providers/next-themes-provider";
import { ModelProvider } from "@/components/providers/model-context";
import { Toaster } from "@/components/ui/sonner";
import { TabletNavProvider } from "@/components/providers/tablet-nav-provider";

export default function Providers({ children }: { children: React.ReactNode; }) {
    return (
        <NextThemesProvider>
            <ModelProvider>
                { children }
                <Toaster richColors position="bottom-right" />
                <TabletNavProvider />
            </ModelProvider>
        </NextThemesProvider>
    );
};