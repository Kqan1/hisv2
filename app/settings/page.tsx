import ThemeToggle from "@/components/themeToggle";
import { Heading } from "@/components/ui/heading";
import { SettingsIcon } from "lucide-react";

export default function Settings() {
    return (
        <div className="space-y-4">
            <Heading title="Settings" description="You can change configure your settings here" Icon={<SettingsIcon size={42} />} />
            <ThemeToggle />
        </div>
    );
}
