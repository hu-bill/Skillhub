// Spine: page frame, navigation, theme and snapshot loading. Feature slices are auto-discovered from
// `src/features/*/feature.tsx`; adding a slice never requires editing this file.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionRequest, HarnessSnapshot } from '../../shared/schema.ts';
import { ActionDialog } from './ActionDialog.tsx';
import { ArrowLoader, Logo, Splash } from './brand/Brand.tsx';
import { Shell, type ActOptions, type FeatureDescriptor, type ServerStatus } from './context.ts';

const modules = import.meta.glob<{ feature?: FeatureDescriptor }>('../features/*/feature.tsx', { eager: true });
const features: FeatureDescriptor[] = Object.values(modules)
  .map((mod) => mod.feature)
  .filter((feature): feature is FeatureDescriptor => Boolean(feature))
  .sort((a, b) => a.order - b.order);

const DEFAULT_STATUS: ServerStatus = { demo: false, gemini: false, geminiModel: '', canWrite: false, writeToken: '', skillTargets: [] };

type Theme = 'auto' | 'light' | 'dark';

function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem('skillhub-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
}

export function App() {
  const [snapshot, setSnapshot] = useState<HarnessSnapshot>();
  const [status, setStatus] = useState<ServerStatus>(DEFAULT_STATUS);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [active, setActive] = useState(() => {
    const fromHash = window.location.hash.slice(1);
    return features.some((feature) => feature.id === fromHash) ? fromHash : features[0]?.id ?? '';
  });
  const [intent, setIntent] = useState<string>();
  const [quick, setQuick] = useState('');

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      const [nextSnapshot, nextStatus] = await Promise.all([
        getJson<HarnessSnapshot>(`/api/snapshot${refresh ? '?refresh=1' : ''}`),
        getJson<ServerStatus>('/api/status'),
      ]);
      setSnapshot(nextSnapshot);
      setStatus(nextStatus);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The dashboard could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('skillhub-theme', theme);
    } catch {
      /* private window: the choice simply lasts for this visit */
    }
  }, [theme]);

  const go = useCallback((featureId: string, nextIntent?: string) => {
    setActive(featureId);
    setIntent(nextIntent);
    window.history.replaceState(null, '', `#${featureId}`);
    window.scrollTo({ top: 0 });
  }, []);

  // Keep the page in step with the address bar (back button, pasted links).
  useEffect(() => {
    function onHashChange() {
      const next = window.location.hash.slice(1);
      if (features.some((feature) => feature.id === next)) setActive(next);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const [pending, setPending] = useState<{ id: number; requests: ActionRequest[]; options: ActOptions }>();
  const dialogCount = useRef(0);
  const closedAt = useRef(0);
  const act = useCallback((requests: ActionRequest[], options: ActOptions) => {
    // A second click that lands just after a dialog closes (a double-click on Done, say) must not
    // open a new confirmation for whatever happens to be under the pointer.
    if (Date.now() - closedAt.current < 600) return;
    dialogCount.current += 1;
    setPending({ id: dialogCount.current, requests, options });
  }, []);

  const shell = useMemo(() => (snapshot ? { snapshot, status, go, intent, act } : null), [snapshot, status, go, intent, act]);
  const current = features.find((feature) => feature.id === active);
  const ActiveComponent = current?.Component;

  useEffect(() => {
    document.title = current ? `${current.title} · Skillhub` : 'Skillhub';
  }, [current]);

  const scannedAt = snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="bar">
        <div className="bar-inner">
          <button type="button" className="bar-logo" onClick={() => go(features[0]?.id ?? '')} aria-label="Skillhub, go to the first page">
            <Logo busy={loading && Boolean(snapshot)} />
          </button>

          <nav className="bar-nav" aria-label="Sections">
            {features.map((feature, index) => (
              <Fragment key={feature.id}>
                {index > 0 && (feature.group ?? 0) !== (features[index - 1].group ?? 0) ? <span className="nav-rule" aria-hidden="true" /> : null}
                <button type="button" className="nav-item" aria-current={feature.id === active ? 'page' : undefined} onClick={() => go(feature.id)}>
                  {feature.title}
                  {feature.tag ? <span className="nav-tag">{feature.tag}</span> : null}
                </button>
              </Fragment>
            ))}
          </nav>

          <div className="bar-actions">
            {status.demo ? <span className="badge">Demo data</span> : null}
            <form
              className="bar-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const query = quick.trim();
                if (query.length < 2) return;
                go(features[0]?.id ?? '', query);
                setQuick('');
              }}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" />
                <path d="m13.2 13.2 3.6 3.6" />
              </svg>
              <input type="search" placeholder="Search skills" aria-label="Search skills" value={quick} onChange={(event) => setQuick(event.target.value)} />
            </form>
            <select className="select" aria-label="Colour theme" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              <option value="auto">Auto theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button type="button" className="btn" onClick={() => void load(true)} disabled={loading} title={`Look at this computer again. Last scan ${scannedAt}`}>
              {loading ? <ArrowLoader size={11} label="Scanning" /> : 'Rescan'}
            </button>
          </div>
        </div>
        {loading && snapshot ? <div className="bar-progress" aria-hidden="true" /> : null}
      </header>

      <div className="page" id="main">
        {!snapshot && !error ? <Splash message="Looking for AI apps on this computer" /> : null}

        {error ? (
          <div className="card empty" role="alert">
            <strong>The dashboard could not load.</strong>
            <div>{error}</div>
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={() => void load(true)}>
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {shell && current && ActiveComponent ? (
          <Shell.Provider value={shell}>
            {current.summary ? (
              <header className="page-head" key={`head-${current.id}`}>
                <h1>{current.title}</h1>
                <p>{current.summary}</p>
              </header>
            ) : null}

            {shell.snapshot.warnings.length > 0 ? (
              <details className="warnings">
                <summary>
                  {shell.snapshot.warnings.length} thing{shell.snapshot.warnings.length === 1 ? '' : 's'} could not be read
                </summary>
                <ul>
                  {shell.snapshot.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            <main className="page-body" key={current.id}>
              <ActiveComponent />
            </main>
          </Shell.Provider>
        ) : null}
      </div>

      {pending && snapshot ? (
        <ActionDialog
          snapshot={snapshot}
          key={pending.id}
          requests={pending.requests}
          options={pending.options}
          status={status}
          onClose={(changed) => {
            closedAt.current = Date.now();
            setPending(undefined);
            if (changed) void load(true);
          }}
        />
      ) : null}
    </>
  );
}
