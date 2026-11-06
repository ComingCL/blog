"use client";
import { createContext, useContext } from "react";
import type { Site, User } from "@/api/types";

import { AuthMode } from "@/models/enums";
export { AuthMode } from "@/models/enums";
interface State {
  user: User | null;
  site: Site;
  ready: boolean;
  authError?: string;
  refresh: () => Promise<void>;
  setSite: (site: Site) => void;
  notify: (message: string) => void;
  openAuth: (mode?: AuthMode) => void;
}
export const AppContext = createContext<State | null>(null);
export function useApp() {
  const state = useContext(AppContext);
  if (!state) throw new Error("App context missing");
  return state;
}
