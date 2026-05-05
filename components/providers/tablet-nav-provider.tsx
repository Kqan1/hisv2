'use client';

import { useTabletNav } from '@/hooks/useTabletNav';

/**
 * Client-only component that activates tablet keyboard navigation.
 * Renders nothing — just runs the hook.
 */
export function TabletNavProvider() {
    useTabletNav();
    return null;
}
