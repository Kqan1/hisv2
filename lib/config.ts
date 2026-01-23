export type SiteConfig = typeof siteConfig;


export const siteConfig = {
    metadata: {
        title: {
            default: "HIS",
            template: "%s | HIS",
        },
        description: "HIS",
        applicationName: "HIS",
        author: [{ name: "Kqan", url: "https://github.com/Kqan1"}],
        keywords: [
            "",
        ],
        icons: {
            icon: "/favicon.ico",
            shortcut: "/favicon-16x16.png",
            apple: "/apple-touch-icon.png",
        },
        category: "app",
        generator: "next.js"
    },
    links: {
        url: "http://localhost:3000",
        github: "https://github.com/Kqan1",
        esp32_base_url: "http://192.168.1.100",
    },
};

export const ESP32_CONFIG = {
    ip: process.env.NEXT_PUBLIC_ESP32_IP || '192.168.10.204',
    useProxy: process.env.NEXT_PUBLIC_USE_PROXY === 'true', // Yeni
    timeout: 3000,
    healthCheckInterval: {
        connected: 5000,
        disconnected: 2000,
        checking: 1000
    }
} as const;