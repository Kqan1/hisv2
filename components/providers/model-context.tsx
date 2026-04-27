'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { DEVICE_MODELS, DEFAULT_MODEL_ID, getModelById, type DeviceModel } from '@/lib/config';

const STORAGE_KEY = 'his-active-model-id';

type ModelContextValue = {
    activeModel: DeviceModel;
    setActiveModel: (modelId: string) => void;
    models: DeviceModel[];
};

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
    const [activeModel, setActiveModelState] = useState<DeviceModel>(() => {
        // SSR guard — default model used during server render
        if (typeof window === 'undefined') return getModelById(DEFAULT_MODEL_ID);
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? getModelById(stored) : getModelById(DEFAULT_MODEL_ID);
    });

    // Sync from localStorage on mount (handles SSR hydration)
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setActiveModelState(getModelById(stored));
        }
    }, []);

    const setActiveModel = useCallback((modelId: string) => {
        const model = getModelById(modelId);
        setActiveModelState(model);
        localStorage.setItem(STORAGE_KEY, model.id);
    }, []);

    return (
        <ModelContext.Provider value={{ activeModel, setActiveModel, models: DEVICE_MODELS }}>
            {children}
        </ModelContext.Provider>
    );
}

export function useModel(): ModelContextValue {
    const ctx = useContext(ModelContext);
    if (!ctx) {
        throw new Error('useModel must be used within a ModelProvider');
    }
    return ctx;
}
