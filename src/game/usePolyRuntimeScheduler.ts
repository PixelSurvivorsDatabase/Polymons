import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  mergePolyRuntimeResults,
  resumePolyScheduledScript,
  type PolyRuntimeResult,
} from "./polyProject";

export function usePolyRuntimeScheduler(
  runtime: PolyRuntimeResult | null,
  setRuntime: Dispatch<SetStateAction<PolyRuntimeResult | null>>,
) {
  const started = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    for (const scheduled of runtime?.scheduledScripts ?? []) {
      if (started.current.has(scheduled.id)) continue;
      started.current.add(scheduled.id);
      const timer = window.setTimeout(() => {
        timers.current.delete(scheduled.id);
        setRuntime((current) => {
          if (!current || current.project.id !== scheduled.projectId) {
            return current;
          }
          return mergePolyRuntimeResults(
            current,
            resumePolyScheduledScript(
              current.project,
              scheduled,
              current.playerData,
            ),
          );
        });
      }, scheduled.delayMs);
      timers.current.set(scheduled.id, timer);
    }
  }, [runtime?.scheduledScripts, setRuntime]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );
}
