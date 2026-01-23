import { buttonVariants } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { cn } from "@/lib/utils";
import { BugIcon, HomeIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";

type MenuItemType = {
    label: string;
    href: string;
    icon: React.ReactNode;
};

const menuItems: MenuItemType[] = [
    {
        label: "Home",
        href: "/",
        icon: <HomeIcon className="size-6" />,
    },
    {
        label: "Settings",
        href: "/settings",
        icon: <SettingsIcon className="size-6" />,
    },
    {
        label: "Debug",
        href: "/debug",
        icon: <BugIcon className="size-6" />,
    },
];

const MenuItem = ({ item }: { item: MenuItemType }) => {
    return (
        <Link
            href={item.href}
            className={cn("flex items-center justify-center flex-col gap-2 border rounded aspect-square !size-full", buttonVariants({ variant: "outline" }))}
        >
            {item.icon}
            <span className="text-xl">{item.label}</span>
        </Link>
    );
};


export default function Home() {
    return (
        <div className="space-y-4">
            <Heading
                title="Home"
                description="You can choose a mode here"
                Icon={<HomeIcon size={42} />}
            />

            <div className="grid grid-cols-3 grid-rows-auto gap-2">
                {menuItems.map((item) => (
                    <MenuItem key={item.href} item={item} />
                ))}
            </div>
        </div>
    );
}
