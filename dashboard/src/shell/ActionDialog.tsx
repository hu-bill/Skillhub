// Spine: the one place a change gets confirmed. It shows the server's plan, step by step, with the
// exact file or command for each, and does nothing until the user presses the button.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionRequest, HarnessSnapshot, PlannedStep, StepResult } from '../../shared/schema.ts';
import type { ActOptions, ServerStatus } from './context.ts';
import { ArrowLoader } from './brand/Brand.tsx';
import { AppMark, Command } from './ui.tsx';

interface Props {
  requests: ActionRequest[];
  options: ActOptions;
  status: ServerStatus;
  snapshot: HarnessSnapshot;
  /** `changed` is true when something was applied, so the caller rescans. */
  onClose(changed: boolean): void;
}

async function post<T>(url: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wayfinder-token': token },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'The dashboard could not do that.');
  return data;
}

export function ActionDialog({ requests, options, status, snapshot, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [steps, setSteps] = useState<PlannedStep[]>();
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [copyCredentials, setCopyCredentials] = useState(true);
  const [results, setResults] = useState<StepResult[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The confirm button stays off for a moment after the plan appears, so a click already on its
  // way when the dialog opened cannot confirm something the user has not had time to read.
  const [armed, setArmed] = useState(false);
  const hasServerCopy = requests.some((request) => request.type === 'mcp.connect');

  const withOptions = useCallback(
    (list: ActionRequest[]) => list.map((request) => (request.type === 'mcp.connect' ? { ...request, copyCredentials } : request)),
    [copyCredentials],
  );

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    post<{ steps: PlannedStep[] }>('/api/actions/plan', status.writeToken, { requests: withOptions(requests) })
      .then((data) => {
        if (cancelled) return;
        setSteps((previous) => {
          // First plan decides the ticks; a re-plan (credentials toggle) keeps the user's choice.
          if (!previous) setChosen(new Set(options.preselect ? data.steps.flatMap((step, index) => (step.ok ? [index] : [])) : []));
          return data.steps;
        });
      })
      .catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : 'The plan could not be prepared.'));
    return () => {
      cancelled = true;
    };
  }, [requests, options.preselect, status.writeToken, withOptions]);

  useEffect(() => {
    if (!steps) return;
    const timer = setTimeout(() => setArmed(true), 700);
    return () => clearTimeout(timer);
  }, [steps]);

  const possible = steps?.flatMap((step, index) => (step.ok ? [index] : [])) ?? [];
  const removing = requests.every((request) => request.type.endsWith('disconnect'));

  async function apply() {
    if (!steps) return;
    setBusy(true);
    setError(undefined);
    try {
      const selected = withOptions(requests.filter((_, index) => chosen.has(index)));
      const data = await post<{ results: StepResult[] }>('/api/actions/apply', status.writeToken, { requests: selected });
      setResults(data.results);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'It failed.');
    } finally {
      setBusy(false);
    }
  }

  function toggle(index: number) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <dialog ref={ref} className="dialog" onClose={() => onClose(Boolean(results))} aria-labelledby="action-dialog-title">
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id="action-dialog-title">{options.title}</h2>
          <p>{results ? 'Here is what happened.' : options.intro ?? 'Check what will change, then confirm. Nothing has happened yet.'}</p>
        </div>

        <div className="dialog-steps">
          {error ? (
            <p role="alert" className="dialog-fail" style={{ padding: '12px 0', margin: 0 }}>
              {error}
            </p>
          ) : null}
          {!steps && !error ? (
            <p style={{ padding: '6px 0' }}>
              <ArrowLoader label="Working out what would change" />
            </p>
          ) : null}

          {results
            ? results.map((result, index) => (
                <div className="dialog-step" key={`${result.title}:${index}`}>
                  <span className={`dialog-mark ${result.ok ? 'dialog-ok' : 'dialog-fail'}`} aria-hidden="true">
                    {result.ok ? '✓' : '✕'}
                  </span>
                  <div>
                    <strong>{result.title}</strong>
                    <div className="dialog-detail">
                      {result.ok ? '' : 'Did not work. '}
                      {result.message}
                    </div>
                  </div>
                </div>
              ))
            : steps?.map((step, index) => (
                <label className={`dialog-step ${step.ok ? '' : 'dialog-step-off'}`} key={`${step.title}:${index}`}>
                  <input type="checkbox" disabled={!step.ok || busy} checked={chosen.has(index)} onChange={() => toggle(index)} />
                  <div>
                    <strong className="dialog-title">
                      {step.app ? <AppMark snapshot={snapshot} appId={step.app} size={20} /> : null}
                      {step.title}
                    </strong>
                    <div className="dialog-detail">{step.ok ? step.detail : `Not possible: ${step.reason}`}</div>
                    {step.ok && chosen.has(index) ? step.warnings.map((warning) => <div className="dialog-warning" key={warning}>{warning}</div>) : null}
                    {!step.ok && step.manual ? (
                      <div style={{ marginTop: 6 }}>
                        <Command label="Do it by hand" command={step.manual} />
                      </div>
                    ) : null}
                  </div>
                </label>
              ))}
        </div>

        <div className="dialog-foot">
          {results ? (
            <>
              <span className="spacer" />
              <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>
                Done
              </button>
            </>
          ) : (
            <>
              {possible.length > 1 ? (
                <button type="button" className="btn" disabled={busy} onClick={() => setChosen(new Set(chosen.size === possible.length ? [] : possible))}>
                  {chosen.size === possible.length ? 'Clear all' : `Select all ${possible.length}`}
                </button>
              ) : null}
              {hasServerCopy ? (
                <label className="dialog-check">
                  <input type="checkbox" checked={copyCredentials} disabled={busy} onChange={(event) => setCopyCredentials(event.target.checked)} />
                  Copy saved credentials too
                </label>
              ) : null}
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={`btn ${removing ? 'btn-danger' : 'btn-primary'}`} onClick={() => void apply()} disabled={busy || !armed || chosen.size === 0}>
                {busy ? <ArrowLoader size={11} label="Working" /> : removing ? `Remove ${chosen.size || ''}`.trim() : `Apply ${chosen.size || ''}`.trim()}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
