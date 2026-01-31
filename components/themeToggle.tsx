"use client";
import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <Button variant="outline" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            {theme === "dark" ? "Light" : "Dark"}
        </Button>
    );
};