import { ConnectionIndicator } from "@/components/ConnectionIndicator";

export default function Header() {
    return (
        <div className="border-b border-zinc-400 dark:border-zinc-600 py-2 flex items-center justify-between p-4">
            <h1 className="text-lg font-bold">HISappv2</h1>
            <div>
                <ConnectionIndicator />
            </div>
        </div>
    );
}
