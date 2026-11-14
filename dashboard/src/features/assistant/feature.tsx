// Slice `assistant`: what stands out in the setup, and a Gemini-backed box for questions in plain words.
// The findings on the left are computed locally with no model call. Gemini is contacted only when the
// user presses Ask, and only with names and descriptions (see server/gemini.ts for the exact list).

import { useMemo, useState } from 'react';
import { computeInsights } from '../../../shared/insights.ts';
import type { AssistantReply, Insight } from '../../../shared/schema.ts';
import { useShell, type FeatureDescriptor } from '../../shell/context.ts';
import { ArrowLoader } from '../../shell/brand/Brand.tsx';
import { Command } from '../../shell/ui.tsx';
import styles from './assistant.module.css';

const STARTERS = [
  'I am new to this. What do I have, in simple words?',
  'Which of my skills overlap or are never used?',
  'What should I connect to Cursor that Claude Code already has?',
  'I want my AI to work with my database. What do I need?',
];

function Finding({ insight }: { insight: Insight }) {
  const { status, act } = useShell();
  const [all, setAll] = useState(false);
  const commands = all ? insight.commands : insight.commands.slice(0, 2);
  return (
    <div className={styles.finding}>
      <h4>{insight.title}</h4>
      <p>{insight.detail}</p>
      {insight.actions.length > 0 && status.canWrite ? (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => act(insight.actions, { title: insight.title, intro: 'Tick what you want done, or select all. Nothing has happened yet.', preselect: false })}
          >
            Fix this…
          </button>
        </div>
      ) : null}
      {commands.length > 0 ? (
        <div className={styles.stack}>
          {commands.map((command) => (
            <Command key={command} command={command} />
          ))}
          {insight.commands.length > 2 ? (
            <button type="button" className={styles.more} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${insight.commands.length} commands`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Assistant() {
  const { snapshot, status, go } = useShell();
  const insights = useMemo(() => computeInsights(snapshot), [snapshot]);
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<{ loading: boolean; reply?: AssistantReply; error?: string }>({ loading: false });

  async function ask(text: string) {
    setQuestion(text);
    setState({ loading: true });
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const reply = (await response.json()) as AssistantReply & { error?: string };
      if (!response.ok) throw new Error(reply.error ?? 'The assistant could not answer.');
      setState({ loading: false, reply });
    } catch (cause) {
      setState({ loading: false, error: cause instanceof Error ? cause.message : 'The assistant could not answer.' });
    }
  }

  return (
    <div className={styles.cols}>
      <div className="card">
        <h3>What stands out</h3>
        <div className="faint">Worked out on this computer from the scan. Fix a finding here after confirming it, or copy the commands and run them yourself.</div>
        {insights.length === 0 ? <div className="empty">Nothing needs attention. Your apps are set up consistently.</div> : insights.map((insight) => <Finding key={insight.id} insight={insight} />)}
      </div>

      <div className="card">
        <h3>Ask about your setup</h3>
        <div className="faint">{status.gemini ? `Answered by Google Gemini (${status.geminiModel}).` : 'Gemini is not connected yet, so questions get the built-in analysis.'}</div>

        {status.gemini ? null : (
          <div className={styles.setup}>
            <strong>Connect Gemini</strong>
            <ol>
              <li>
                Create a key at{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener">
                  aistudio.google.com/apikey
                </a>
                .
              </li>
              <li>
                Put it in <code>dashboard/.env.local</code> as <code>GEMINI_API_KEY=…</code> (the file is git-ignored).
              </li>
              <li>Restart the dashboard.</li>
            </ol>
          </div>
        )}

        <form
          className={styles.ask}
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <input className="input" placeholder="Ask in your own words" aria-label="Question for the assistant" value={question} onChange={(event) => setQuestion(event.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={state.loading}>
            {state.loading ? <ArrowLoader size={11} label="Thinking" /> : 'Ask'}
          </button>
        </form>
        <p className={styles.privacy}>
          {status.gemini
            ? 'Pressing Ask sends Google the names of your apps, skills, MCP servers and plugins, skill descriptions, and token totals. File contents, commands, addresses, paths and secrets are never sent.'
            : 'Without a key nothing is sent anywhere.'}
        </p>
        <div className={styles.chips}>
          {STARTERS.map((starter) => (
            <button key={starter} type="button" className={styles.chip} onClick={() => void ask(starter)} disabled={state.loading}>
              {starter}
            </button>
          ))}
        </div>

        {state.error ? (
          <p role="alert" className="muted">
            {state.error}
          </p>
        ) : null}

        {state.reply ? (
          <div className={styles.reply} aria-live="polite">
            <p style={{ marginTop: 0 }}>{state.reply.summary}</p>
            {state.reply.steps.length > 0 ? (
              <ol className={styles.steps}>
                {state.reply.steps.map((step) => (
                  <li key={step.title}>
                    <strong>{step.title}</strong>
                    <br />
                    <span>{step.detail}</span>
                    {step.command ? (
                      <div style={{ marginTop: 6 }}>
                        <Command command={step.command} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {state.reply.searches.length > 0 ? (
              <div className={styles.chips}>
                <span className="faint">Look for</span>
                {state.reply.searches.map((search) => (
                  <button key={search} type="button" className={styles.chip} onClick={() => go('explore', search)}>
                    {search}
                  </button>
                ))}
              </div>
            ) : null}
            {state.reply.note ? <p className={styles.privacy} style={{ marginTop: 10 }}>{state.reply.note}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const feature: FeatureDescriptor = {
  id: 'assistant',
  title: 'Ask',
  summary: 'What stands out in your setup, and answers in plain words.',
  tag: 'AI',
  group: 1,
  order: 60,
  Component: Assistant,
};
