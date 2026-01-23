import NextThemesProvider from "@/components/providers/next-themes-provider";

export default function Providers({ children }: { children: React.ReactNode; }) {
    return (
        <NextThemesProvider>
            { children }
        </NextThemesProvider>
    );
};