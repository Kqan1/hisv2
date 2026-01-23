import { cn } from "@/lib/utils";

type Props = {
    children: React.ReactNode;
    className?: string;
};

export default function MaxWidthWrapper({ children, className }: Props) {
    return (
        <div className={cn("mx-auto w-full max-w-100 border-2 border-zinc-400 rounded-md", className)}>
            {children}
        </div>
    );
}