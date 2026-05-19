"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";

interface FuelLevelData {
    fuelLevel: number;
    currentFuel: number;
    estimatedRange: number;
    avgKmPerGallon: number;
    lastFullTankDate: string | null;
    lastFullTankKm: number;
    totalConsumed: number;
    anomalyDetected: boolean;
    expectedConsumption: number;
    actualConsumption: number;
}

export function useFuelLevel(vehicleId: string) {
    const [fuelLevel, setFuelLevel] = useState<FuelLevelData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const fetchFuelLevel = useCallback(async () => {
        if (!vehicleId) return;

        try {
            setLoading(true);
            const data = await apiFetch<FuelLevelData>(`/api/vehicles/${vehicleId}/fuel-level`);
            if (mountedRef.current) {
                setFuelLevel(data);
                setError(null);
            }
        } catch (err) {
            if (mountedRef.current) {
                console.error("Error fetching fuel level:", err);
                setError("No se pudo cargar el nivel de combustible");
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [vehicleId]);

    useEffect(() => {
        mountedRef.current = true;
        fetchFuelLevel();
        return () => {
            mountedRef.current = false;
        };
    }, [fetchFuelLevel]);

    return {
        fuelLevel,
        loading,
        error,
        refresh: fetchFuelLevel,
    };
}