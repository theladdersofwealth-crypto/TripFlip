"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Trip, TripConditions, TripProfile } from "@/lib/types";
import { EMPTY_STATE, loadState, saveState, type PersistedState } from "@/lib/storage";
import { generateRecommendation } from "@/services/recommendation";
import { getDestination } from "@/data/repository";
import { uid } from "@/lib/time";
import { DEMO_PROFILE } from "@/services/demo";

/** Free 플랜 저장 한도 (Premium = 무제한) */
export const FREE_TRIP_LIMIT = 3;

interface Store extends PersistedState {
  ready: boolean;
  setConditions: (c: TripConditions) => void;
  createTrip: (destinationId: string, profile: TripProfile, opts?: { demo?: boolean }) => Trip | null;
  createDemoTrip: () => Trip | null;
  updateTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  toggleDestinationFavorite: (id: string) => void;
  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function TripStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setState(loadState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveState(state);
  }, [state, ready]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((showToast as unknown as { t?: number }).t);
    (showToast as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const createTrip = useCallback(
    (destinationId: string, profile: TripProfile, opts?: { demo?: boolean }) => {
      if (state.trips.length >= FREE_TRIP_LIMIT) return null;
      const rec = generateRecommendation(destinationId, profile);
      const now = new Date().toISOString();
      const dest = getDestination(destinationId);
      const trip: Trip = {
        ...rec,
        id: uid("trip"),
        title: `${dest?.name ?? destinationId} ${rec.days.length - 1}박 ${rec.days.length}일`,
        createdAt: now,
        updatedAt: now,
        favorites: [],
        demo: !!opts?.demo,
      };
      setState((s) => ({ ...s, trips: [trip, ...s.trips] }));
      return trip;
    },
    [state.trips.length],
  );

  const value = useMemo<Store>(
    () => ({
      ...state,
      ready,
      toast,
      showToast,
      setConditions: (c) => setState((s) => ({ ...s, conditions: c })),
      createTrip,
      createDemoTrip: () => {
        const existing = state.trips.find((t) => t.demo);
        if (existing) return existing;
        return createTrip("nha-trang", DEMO_PROFILE, { demo: true });
      },
      updateTrip: (trip) => setState((s) => ({ ...s, trips: s.trips.map((t) => (t.id === trip.id ? trip : t)) })),
      deleteTrip: (id) => setState((s) => ({ ...s, trips: s.trips.filter((t) => t.id !== id) })),
      toggleDestinationFavorite: (id) =>
        setState((s) => ({
          ...s,
          destinationFavorites: s.destinationFavorites.includes(id) ? s.destinationFavorites.filter((x) => x !== id) : [...s.destinationFavorites, id],
        })),
    }),
    [state, ready, toast, showToast, createTrip],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTripStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("TripStoreProvider missing");
  return v;
}
