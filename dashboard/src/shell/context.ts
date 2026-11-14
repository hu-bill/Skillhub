// Spine: what the shell hands to every feature slice.

import { createContext, useContext, type ComponentType } from 'react';
import type { ActionRequest, HarnessSnapshot } from '../../shared/schema.ts';

export interface ServerStatus {
  demo: boolean;
  gemini: boolean;
  geminiModel: string;
  /** False in demo mode: the bundled data is not a real machine, so nothing can be changed. */
  canWrite: boolean;
  writeToken: string;
  /** Apps the skills installer can install into. */
  skillTargets: string[];
}

export interface ActOptions {
  title: string;
  intro?: string;
  /** Tick every possible step up front. Off for "pick where this goes" dialogs. */
  preselect: boolean;
}

export interface ShellContext {
  snapshot: HarnessSnapshot;
  status: ServerStatus;
  /** Switch tab, optionally handing the target slice a value (for example a search phrase). */
  go(featureId: string, intent?: string): void;
  /** The value handed over by the last `go`, for the active slice to consume. */
  intent: string | undefined;
  /** Show the plan for these changes and let the user confirm. Nothing happens until they do. */
  act(requests: ActionRequest[], options: ActOptions): void;
}

export const Shell = createContext<ShellContext | null>(null);

export function useShell(): ShellContext {
  const value = useContext(Shell);
  if (!value) throw new Error('useShell must be used inside the dashboard shell.');
  return value;
}

/** What `src/features/<slice-id>/feature.tsx` exports as `feature`. The shell discovers it on its own. */
export interface FeatureDescriptor {
  id: string;
  /** The navigation label: one or two short words. */
  title: string;
  /** One short line under the page title. Leave it out when the page opens with its own hero. */
  summary?: string;
  /** A tiny label next to the navigation item, such as "AI". */
  tag?: string;
  /** Items in different groups are separated by a hairline in the navigation. */
  group?: number;
  order: number;
  Component: ComponentType;
}
