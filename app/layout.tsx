import "./globals.css";
import type { Metadata } from "next";
import { siteConfig } from "@/lib/config";
import { fontSans } from "@/utils/fonts";
import { cn } from "@/lib/utils";

import Providers from "@/components/providers/providers";
import MaxWidthWrapper from "@/components/max-width-wrapper";
import Header from "@/components/header";
import Nav from "@/components/nav";

export const metadata: Metadata = siteConfig.metadata;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className="h-full" suppressHydrationWarning>
            <body className={cn("bg-background h-full overflow-hidden font-sans antialiased text-foreground",fontSans.variable)}>
                <Providers>
                    <main className="flex h-full w-full justify-center">
                        <MaxWidthWrapper className="flex m-auto h-full max-h-[80vh] flex-col">
                            <Header />
                            <div className="flex-1 overflow-y-auto p-4">
                                {children}
                            </div>
                            <Nav />
                        </MaxWidthWrapper>
                    </main>
                </Providers>
            </body>
        </html>
    );
}
