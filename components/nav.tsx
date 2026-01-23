"use client";
import { BugIcon, HomeIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItemType = {
    label: string;
    href: string;
    icon: React.ReactNode;
};

const navItems: NavItemType[] = [
    { label: "Home", href: "/", icon: <HomeIcon size={20} /> },
    { label: "Settings", href: "/settings", icon: <SettingsIcon size={20} /> },
    { label: "Debug", href: "/debug", icon: <BugIcon size={20} /> },
];

const NavItem = ({ item, isActive }: { item: NavItemType; isActive: boolean }) => {
    return (
        <Link
            href={item.href}
            className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
                isActive 
                ? "text-zinc-900 dark:text-zinc-100" 
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
        >
            {item.icon}
            <span className="text-xs font-medium">{item.label}</span>
        </Link>
    );
};

export default function Nav() {
    const pathname = usePathname();

    return (
        <nav className="border-t border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="grid grid-cols-3">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    
                    return (
                        <NavItem 
                            key={item.href} 
                            item={item} 
                            isActive={isActive} 
                        />
                    );
                })}
            </div>
        </nav>
    );
}