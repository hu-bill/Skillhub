// Slice `explore`: the first page, built for someone who just wants to find a good skill.
// A search box, topic chips, and rows of suggested skills as cards. The user's own setup is one line.
//
// Registry text is third-party data and is rendered as plain text. Installing goes through the
// shell's confirmation dialog, where the user picks which apps get the skill.

import { useEffect, useMemo, useState } from 'react';
import { computeInsights } from '../../../shared/insights.ts';
import type { ActionRequest, DiscoverResult, Suggestions } from '../../../shared/schema.ts';
import { TAGS, tagLabel } from '../../../shared/tags.ts';
import { Arrow, ArrowLoader } from '../../shell/brand/Brand.tsx';
import { useShell, type FeatureDescriptor } from '../../shell/context.ts';
import { AppMark, SkillCard, TagChip, detectedApps, formatTokens } from '../../shell/ui.tsx';
import styles from './explore.module.css';

interface SearchResponse {
  query: string;
  results: DiscoverResult[];
  errors: string[];
  error?: string;
}

function ResultCard({ result, onTag }: { result: DiscoverResult; onTag: (id: string) => void }) {
  const { snapshot, status, act } = useShell();

  function install() {
    const install = result.install;
    if (!install) return;
    const apps = detectedApps(snapshot).filter((app) => (install.type === 'registry.skill' ? status.skillTargets.includes(app.id) : Boolean(app.mcpAdd)));
    const requests: ActionRequest[] = apps.map((app) => ({ ...install, app: app.id }));
    act(requests, { title: `Install ${result.name}`, intro: 'Pick the apps that should get it, or select all. Nothing has happened yet.', preselect: false });
  }

  return (
    <SkillCard
      name={result.name}
      owner={result.owner}
      description={result.description}
      tags={result.tags}
      href={result.sourceUrl}
      onTag={onTag}
      status={result.installed ? 'Installed' : undefined}
      meta={result.installs !== undefined ? `${formatTokens(result.installs)} installs` : result.registry}
      action={
        result.installed ? null : result.install && status.canWrite ? (
          <button type="button" className="btn btn-primary" onClick={install}>
            Install
          </button>
        ) : (
          <a className="btn" href={result.sourceUrl} target="_blank" rel="noreferrer noopener">
            View
          </a>
        )
      }
    />
  );
}

function Explore() {
  const { snapshot, intent, go } = useShell();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ loading: boolean; data?: SearchResponse; error?: string }>({ loading: false });
  const [kind, setKind] = useState<'skill' | 'mcp'>('skill');
  const [suggestions, setSuggestions] = useState<Suggestions>();
  const [suggestError, setSuggestError] = useState(false);

  const apps = detectedApps(snapshot);
  const skillCount = new Set(snapshot.slices.skills.items.map((skill) => skill.key)).size;
  const serverCount = new Set(snapshot.slices.mcp.servers.map((server) => server.key)).size;
  const findings = useMemo(() => computeInsights(snapshot).filter((insight) => insight.kind !== 'info').length, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/suggestions')
      .then((response) => (response.ok ? (response.json() as Promise<Suggestions>) : Promise.reject(new Error('failed'))))
      .then((data) => !cancelled && setSuggestions(data))
      .catch(() => !cancelled && setSuggestError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(text: string) {
    const term = text.trim();
    if (term.length < 2) return;
    setQuery(term);
    setSearch({ loading: true });
    try {
      const response = await fetch(`/api/discover?q=${encodeURIComponent(term)}`);
      const data = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(data.error ?? 'The search failed.');
      setSearch({ loading: false, data });
      setKind(data.results.some((result) => result.type === 'skill') ? 'skill' : 'mcp');
    } catch (cause) {
      setSearch({ loading: false, error: cause instanceof Error ? cause.message : 'The search failed.' });
    }
  }

  useEffect(() => {
    if (intent) void run(intent);
    // Only react to a new hand-over (the top-bar search, or a suggestion from Ask).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  function clear() {
    setQuery('');
    setSearch({ loading: false });
  }

  const byTopic = (id: string) => void run(TAGS.find((tag) => tag.id === id)?.query ?? id);
  const results = search.data?.results ?? [];
  const skills = results.filter((result) => result.type === 'skill').sort((a, b) => (b.installs ?? 0) - (a.installs ?? 0));
  const servers = results.filter((result) => result.type !== 'skill');
  const shown = kind === 'skill' ? skills : servers;
  const searching = search.loading || Boolean(search.data) || Boolean(search.error);

  return (
    <div>
      <section className={styles.hero} aria-labelledby="explore-title">
        <h1 id="explore-title">
          Find the right <em>skill</em> for your AI
        </h1>
        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void run(query);
          }}
        >
          <input className="input" type="search" placeholder="What should your AI be good at?" aria-label="Search skills and MCP servers" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={search.loading || query.trim().length < 2}>
            {search.loading ? <ArrowLoader size={12} label="Searching" /> : 'Search'}
          </button>
        </form>
        <div className={`tag-row ${styles.topics}`}>
          {TAGS.map((tag) => (
            <TagChip key={tag.id} id={tag.id} active={searching && query === tag.query} onClick={() => byTopic(tag.id)} />
          ))}
        </div>
      </section>

      {searching ? (
        <section aria-live="polite">
          <div className={styles.resultsHead}>
            <h2>{search.loading ? 'Searching' : `Results for “${search.data?.query ?? query}”`}</h2>
            {search.data ? (
              <div className={styles.seg} role="group" aria-label="What to show">
                <button type="button" aria-pressed={kind === 'skill'} onClick={() => setKind('skill')}>
                  Skills {skills.length}
                </button>
                <button type="button" aria-pressed={kind === 'mcp'} onClick={() => setKind('mcp')}>
                  MCP servers {servers.length}
                </button>
              </div>
            ) : null}
            <button type="button" className={styles.link} onClick={clear} style={{ marginLeft: 'auto' }}>
              Back to suggestions <Arrow size={10} />
            </button>
          </div>
          {search.loading ? (
            <div className="card-grid">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className={styles.skeleton} />
              ))}
            </div>
          ) : null}
          {search.error ? (
            <div className="card empty" role="alert">
              {search.error}
            </div>
          ) : null}
          {search.data && shown.length === 0 ? (
            <div className="card empty">
              <div className="empty-mark">
                <Arrow size={30} />
              </div>
              <div>
                {kind === 'skill' ? 'No skills matched.' : 'No servers have that word in their name.'} Try one word, such as the name of a tool.
              </div>
            </div>
          ) : null}
          {search.data && shown.length > 0 ? (
            <div className="card-grid">
              {shown.map((result) => (
                <ResultCard key={result.id} result={result} onTag={byTopic} />
              ))}
            </div>
          ) : null}
          {search.data?.errors.map((message) => (
            <p key={message} className={styles.note}>
              {message}
            </p>
          ))}
        </section>
      ) : (
        <>
          <section className={styles.setup} aria-label="Your setup">
            <div className={styles.marks}>
              {apps.map((app) => (
                <AppMark key={app.id} snapshot={snapshot} appId={app.id} size={28} />
              ))}
            </div>
            <span className={styles.setupText}>
              <b>{apps.length} apps</b> · <b>{skillCount} skills</b> · <b>{serverCount} servers</b> on this computer
            </span>
            <div className={styles.setupLinks}>
              {findings > 0 ? (
                <button type="button" className={styles.link} onClick={() => go('assistant')}>
                  {findings} to fix <Arrow size={10} />
                </button>
              ) : null}
              <button type="button" className={styles.link} onClick={() => go('skills')}>
                My skills <Arrow size={10} />
              </button>
              <button type="button" className={styles.link} onClick={() => go('map')}>
                Open the map <Arrow size={10} />
              </button>
            </div>
          </section>

          {!suggestions && !suggestError ? (
            <section className={styles.rail}>
              <div className={styles.loading}>
                <ArrowLoader label="Finding skills worth knowing about" />
              </div>
              <div className={styles.track}>
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className={styles.skeleton} />
                ))}
              </div>
            </section>
          ) : null}

          {suggestError || (suggestions && suggestions.rails.length === 0) ? (
            <div className="card empty">Suggestions could not be loaded right now. Search still works.</div>
          ) : null}

          {suggestions?.rails.map((rail) => (
            <section key={rail.id} className={styles.rail} aria-labelledby={`rail-${rail.id}`}>
              <div className={styles.railHead}>
                <h2 id={`rail-${rail.id}`}>{rail.title}</h2>
                <span>{rail.id === 'for-you' ? `Based on your ${suggestions.interests.map(tagLabel).join(', ')} skills` : rail.reason}</span>
                {rail.id !== 'for-you' ? (
                  <button type="button" className={styles.link} onClick={() => byTopic(rail.id)}>
                    See all <Arrow size={10} />
                  </button>
                ) : null}
              </div>
              <div className={styles.track}>
                {rail.items.map((item) => (
                  <ResultCard key={item.id} result={item} onTag={byTopic} />
                ))}
              </div>
            </section>
          ))}

          {suggestions && suggestions.rails.length > 0 ? (
            <p className={styles.note}>
              Suggestions are the most installed skills on skills.sh in topics close to yours. Nobody here has reviewed them: open a skill and read it before you install it.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export const feature: FeatureDescriptor = { id: 'explore', title: 'Explore', order: 5, Component: Explore };
