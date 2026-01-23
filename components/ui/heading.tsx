"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

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
    Icon
}) => {
    const router = useRouter();

    return (
        <div className={cn("flex justify-between items-center", className)}>
            <div className="flex justify-center items-center">
                {Icon && (
                    <div className="mr-2 h-full flex items-center">
                        {Icon}
                    </div>
                )}

                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
            <Button
                variant="default"
                size="icon"
                className="cursor-pointer"
                onClick={() => router.back()}
            >
                <ArrowLeft className="size-5" />
            </Button>
        </div>
    );
};