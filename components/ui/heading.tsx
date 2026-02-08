"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

interface HeadingProps {
    title: string;
    description: string;
    className?: string;
    Icon?: React.ReactNode;
}

export const Heading: React.FC<HeadingProps> = ({
    title,
    description,
    className,
    Icon,
}) => {
    const pathname = usePathname();
    const router = useRouter();

    const segments = pathname.split("/").filter(Boolean);

    const parentPath =
        segments.length > 1
            ? "/" + segments.slice(0, -1).join("/")
            : "/";

    const handleBack = () => {
        router.push(parentPath);
    };

    return (
        <div className={cn("flex justify-between items-center", className)}>
            <div className="flex items-center">
                {Icon && <div className="mr-2 flex items-center">{Icon}</div>}

                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>

            {pathname !== "/" && (
                <Button
                    variant="default"
                    size="icon"
                    className="cursor-pointer"
                    onClick={handleBack}
                >
                    <ArrowLeft className="size-5" />
                </Button>
            )}
        </div>
    );
};
