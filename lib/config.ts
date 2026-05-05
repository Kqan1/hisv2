// ========================================================================
// DEVICE MODEL DEFINITIONS
// ========================================================================

export type DeviceModel = {
    id: string;
    name: string;
    rows: number;
    cols: number;
    description?: string;
    image?: string;
};

export const DEVICE_MODELS: DeviceModel[] = [
    { id: 'amc-1', name: 'AMC-1', rows: 10, cols: 15, description: 'Standard Model', image: '/devices/amc-1-render.png' },
    { id: 'amc-3', name: 'AMC-3', rows: 20, cols: 20, description: 'Upcoming Prototype', image: '/devices/wip.png' },
];

export const DEFAULT_MODEL_ID = 'amc-1';

export function getModelById(id: string): DeviceModel {
    return DEVICE_MODELS.find(m => m.id === id) || DEVICE_MODELS.find(m => m.id === DEFAULT_MODEL_ID)!;
}

// ========================================================================
// SITE CONFIG
// ========================================================================

export type SiteConfig = typeof siteConfig;


export const siteConfig = {
    metadata: {
        title: {
            default: "HIS",
            template: "%s | HIS",
        },
        description: "HIS",
        applicationName: "HIS",
        author: [{ name: "Kqan", url: "https://github.com/Kqan1" }, { name: "Ahmet Yavuz Düğmeci", url: "https://github.com/KSPRehber" }],
        keywords: [
            "",
        ],
        icons: {
            icon: "/favicon.ico",
        },
        category: "app",
        generator: "next.js"
    },
    links: {
        url: "http://localhost:3000",
        github: "https://github.com/Kqan1",
    },
};

export const ESP32_CONFIG = {
    // Default rows/cols (used as server-side fallback)
    rows: getModelById(DEFAULT_MODEL_ID).rows,
    cols: getModelById(DEFAULT_MODEL_ID).cols,
    useProxy: process.env.NEXT_PUBLIC_USE_PROXY === 'true',
    password: process.env.NEXT_PUBLIC_ESP32_PASSWORD || '7580',
    apiUser: process.env.NEXT_PUBLIC_ESP32_USER || 'api_user',
    apiPass: process.env.NEXT_PUBLIC_ESP32_API_PASS || 'api_pass',
    timeout: 3000,
} as const;