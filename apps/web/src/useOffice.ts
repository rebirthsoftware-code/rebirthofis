import { useEffect, useReducer, useState } from "react";
import type { OfficeEvent, OfficeSnapshot } from "@rebirth/shared";
import { subscribe } from "./api";

type State = { snapshot: OfficeSnapshot | null };

function reducer(state: State, e: OfficeEvent): State {
  if (e.type === "snapshot") return { snapshot: e.snapshot };
  const snap = state.snapshot;
  if (!snap) return state;
  switch (e.type) {
    case "employee":
      return {
        snapshot: {
          ...snap,
          states: snap.states.map((s) => (s.employeeId === e.state.employeeId ? e.state : s)),
        },
      };
    case "task": {
      const exists = snap.tasks.some((t) => t.id === e.task.id);
      const tasks = exists ? snap.tasks.map((t) => (t.id === e.task.id ? e.task : t)) : [e.task, ...snap.tasks];
      return { snapshot: { ...snap, tasks } };
    }
    case "log":
      return {
        snapshot: {
          ...snap,
          tasks: snap.tasks.map((t) => (t.id === e.taskId ? { ...t, log: [...t.log, e.entry] } : t)),
        },
      };
    default:
      return state;
  }
}

export function useOffice() {
  const [state, dispatch] = useReducer(reducer, { snapshot: null });
  const [connected, setConnected] = useState(false);
  useEffect(() => subscribe(dispatch, setConnected), []);
  return { snapshot: state.snapshot, connected };
}
