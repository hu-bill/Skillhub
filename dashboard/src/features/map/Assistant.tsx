// The assistant beside the map. Type what you want; it answers, re-arranges the map, proposes
// changes or finds skills. A proposed change is only a proposal: "Review" opens the same
// confirmation dialog as dragging an arrow, and that dialog is the only thing that applies it.

import { useEffect, useRef, useState } from 'react';
import type { ActionRequest, CommandReply, DiscoverResult, MapView } from '../../../shared/schema.ts';
import { ArrowLoader } from '../../shell/brand/Brand.tsx';
import { useShell } from '../../shell/context.ts';
import { AppMark, detectedApps, formatTokens } from '../../shell/ui.tsx';
import styles from './panel.module.css';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  reply?: CommandReply;
}

const STARTERS = ['What is Cursor missing?', 'Add my design skills to every app', 'Show only what my apps share', 'Sort skills by most used', 'Find a skill for testing'];

function Found({ result }: { result: DiscoverResult }) {
  const { snapshot, status, act } = useShell();
  function install() {
    const install = result.install;
    if (!install) return;
    const apps = detectedApps(snapshot).filter((app) => (install.type === 'registry.skill' ? status.skillTargets.includes(app.id) : Boolean(app.mcpAdd)));
    act(apps.map((app): ActionRequest => ({ ...install, app: app.id })), { title: `Install ${result.name}`, intro: 'Pick the apps that should get it, or select all. Nothing has happened yet.', preselect: false });
  }
  return (
    <li className={styles.found}>
      <div className={styles.foundText}>
        <a href={result.sourceUrl} target="_blank" rel="noreferrer noopener">
          {result.name}
        </a>
        <span>
          {result.owner}
          {result.installs !== undefined ? ` · ${formatTokens(result.installs)} installs` : ''}
        </span>
        {result.description ? <p>{result.description}</p> : null}
      </div>
      {result.install && status.canWrite ? (
        <button type="button" className="btn btn-primary" onClick={install}>
          Install
        </button>
      ) : null}
    </li>
  );
}

interface Props {
  turns: Turn[];
  setTurns: (update: (turns: Turn[]) => Turn[]) => void;
  onView: (view: Partial<MapView>) => void;
  onResetView: () => void;
}

export function MapAssistant({ turns, setTurns, onView, onResetView }: Props) {
  const { snapshot, status, act } = useShell();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    const history = turns.map((turn) => ({ role: turn.role, text: turn.text }));
    setTurns((current) => [...current, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const response = await fetch('/api/assistant/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const reply = (await response.json()) as CommandReply & { error?: string };
      if (!response.ok) throw new Error(reply.error ?? 'The assistant could not answer.');
      setTurns((current) => [...current, { role: 'assistant', text: reply.text, reply }]);
      if (reply.view) onView(reply.view);
    } catch (cause) {
      setTurns((current) => [...current, { role: 'assistant', text: cause instanceof Error ? cause.message : 'The assistant could not answer.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.messages} aria-live="polite">
        {turns.length === 0 ? (
          <div className={styles.intro}>
            <p>Tell me what you want changed, shown or found. I propose, you confirm.</p>
            <div className={styles.starters}>
              {STARTERS.map((starter) => (
                <button key={starter} type="button" className={styles.starter} onClick={() => void send(starter)} disabled={busy}>
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((turn, index) => {
          const possible = turn.reply?.proposals.filter((step) => step.ok) ?? [];
          const blocked = turn.reply?.proposals.filter((step) => !step.ok) ?? [];
          return (
            <div key={index} className={turn.role === 'user' ? styles.user : styles.bot}>
              <p>{turn.text}</p>

              {possible.length > 0 ? (
                <div className={styles.proposal}>
                  <ul>
                    {possible.slice(0, 8).map((step, stepIndex) => (
                      <li key={stepIndex}>
                        {step.app ? <AppMark snapshot={snapshot} appId={step.app} size={18} /> : null}
                        <span>{step.title}</span>
                      </li>
                    ))}
                  </ul>
                  {possible.length > 8 ? <div className={styles.more}>and {possible.length - 8} more</div> : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!status.canWrite}
                    onClick={() => act(possible.map((step) => step.request), { title: 'Changes the assistant proposes', preselect: true })}
                  >
                    Review {possible.length} change{possible.length === 1 ? '' : 's'}
                  </button>
                </div>
              ) : null}

              {blocked.length > 0 ? (
                <ul className={styles.blocked}>
                  {blocked.slice(0, 4).map((step, stepIndex) => (
                    <li key={stepIndex}>
                      {step.title}: {step.reason}
                    </li>
                  ))}
                </ul>
              ) : null}

              {turn.reply?.view ? (
                <div className={styles.viewNote}>
                  Map view updated.
                  <button type="button" onClick={onResetView}>
                    Reset
                  </button>
                </div>
              ) : null}

              {turn.reply && turn.reply.found.length > 0 ? (
                <ul className={styles.foundList}>
                  {turn.reply.found.map((result) => (
                    <Found key={result.id} result={result} />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}

        {busy ? (
          <div className={styles.bot}>
            <ArrowLoader label="Thinking" />
          </div>
        ) : null}
        <div ref={end} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input className="input" placeholder={status.gemini ? 'Ask or tell me what to change' : 'Add a Gemini key to use the assistant'} aria-label="Message the assistant" value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
      <p className={styles.privacy}>
        {status.gemini
          ? 'Send shares the names of your apps, skills, MCP servers and project folders with Google Gemini. No file contents, paths or secrets.'
          : 'Not connected. Nothing is sent anywhere.'}
      </p>
    </div>
  );
}
