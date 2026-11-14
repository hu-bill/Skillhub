// The Skillhub landing page. One file of sections, top to bottom, so the page reads like it scrolls.
//
// Photos of people are optional files in public/people/<slot>.jpg (see the README there). Until a
// photo exists, its slot shows a drawn placeholder, so the page is complete either way.
//
// Motion rules, same as the app: only transform and opacity move, the arrow always travels forward,
// and nothing is hidden behind an animation (content is readable even where animations are paused).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Arrow, Logo, Marching } from './brand/Brand.tsx';
import { ARROW_PATH } from './brand/paths.ts';

const REPO = 'https://github.com/hu-bill/Skillhub';

// ---------------------------------------------------------------------------------------------
// Small hooks

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Adds `is-in` once the element scrolls into view. The element is visible before that too. */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.add('is-in');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** A button that leans a few pixels toward the pointer. Moves through CSS variables, not React state. */
function MagneticLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  function onMove(event: React.PointerEvent) {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    element.style.setProperty('--mx', `${((event.clientX - box.left) / box.width - 0.5) * 8}px`);
    element.style.setProperty('--my', `${((event.clientY - box.top) / box.height - 0.5) * 6}px`);
  }
  function onLeave() {
    ref.current?.style.setProperty('--mx', '0px');
    ref.current?.style.setProperty('--my', '0px');
  }
  return (
    <a ref={ref} href={href} className={`${className} magnetic`} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------------------------
// Data. Skills named here are real listings on skills.sh; install counts are from November 2026.

const SKILLS = [
  { name: 'frontend-design', owner: 'anthropics/skills', tag: 'Design', installs: '1.12M' },
  { name: 'grill-me', owner: 'mattpocock/skills', tag: 'Workflow', installs: '1.55M' },
  { name: 'handoff', owner: 'mattpocock/skills', tag: 'AI & agents', installs: '1.14M' },
  { name: 'code-review', owner: 'mattpocock/skills', tag: 'Testing', installs: '891K' },
  { name: 'web-design-guidelines', owner: 'vercel-labs/agent-skills', tag: 'Frontend', installs: '861K' },
  { name: 'supabase-postgres-best-practices', owner: 'supabase/agent-skills', tag: 'Data & SQL', installs: '485K' },
  { name: 'prisma-postgres', owner: 'prisma/skills', tag: 'Data & SQL', installs: '418K' },
  { name: 'triage', owner: 'mattpocock/skills', tag: 'Workflow', installs: '1.07M' },
];

const PEOPLE = [
  { slot: 'skier', who: 'A skier', learns: 'reads the slope before the turn', skill: 'grill-me', shape: 'tall' },
  { slot: 'illustrator', who: 'An illustrator', learns: 'gives every line a reason', skill: 'frontend-design', shape: 'wide' },
  { slot: 'mathematician', who: 'A mathematician', learns: 'makes the numbers answer', skill: 'prisma-postgres', shape: 'tall' },
  { slot: 'painter', who: 'A painter', learns: 'knows when a picture is finished', skill: 'web-design-guidelines', shape: 'square' },
  { slot: 'accountant', who: 'An accountant', learns: 'checks every entry twice', skill: 'code-review', shape: 'tall' },
  { slot: 'architect', who: 'An architect', learns: 'draws the plan others build from', skill: 'handoff', shape: 'wide' },
  { slot: 'chess-player', who: 'A chess player', learns: 'decides what matters first', skill: 'triage', shape: 'square' },
] as const;

const APPS = [
  { id: 'claude-code', name: 'Claude Code', mark: 'CC' },
  { id: 'codex', name: 'Codex', mark: 'CX' },
  { id: 'cursor', name: 'Cursor', mark: 'CU' },
];

const WORKS_WITH = ['Claude Code', 'Claude desktop', 'Codex', 'Cursor', 'VS Code', 'Antigravity', 'Gemini CLI', 'Pi', 'opencode', 'Windsurf', 'Zed'];

// ---------------------------------------------------------------------------------------------
// The live map: skills on the left, apps in the middle, tools on the right, arrows flowing forward.

function FlowMap({ id }: { id: string }) {
  const reduced = useReducedMotion();
  const left = ['frontend-design', 'grill-me', 'code-review', 'handoff'];
  const right = ['github', 'postgres', 'browser'];
  const leftY = (index: number) => 58 + index * 66;
  const appY = (index: number) => 96 + index * 96;
  const rightY = (index: number) => 104 + index * 88;
  const leftLinks: [number, number][] = [[0, 0], [0, 2], [1, 0], [1, 1], [2, 1], [3, 0], [3, 1], [3, 2]];
  const rightLinks: [number, number][] = [[0, 0], [1, 0], [1, 1], [2, 2], [0, 2]];
  const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;

  const links = [
    ...leftLinks.map(([from, to], index) => ({ key: `l${index}`, d: curve(168, leftY(from), 224, appY(to)), app: APPS[to].id })),
    ...rightLinks.map(([from, to], index) => ({ key: `r${index}`, d: curve(346, appY(from), 402, rightY(to)), app: APPS[from].id })),
  ];

  return (
    <svg className="flow" viewBox="0 0 560 348" role="img" aria-label="A map: four skills on the left connect to three AI apps in the middle, which connect to three tools on the right.">
      {links.map((link, index) => (
        <g key={link.key}>
          <path id={`${id}-${link.key}`} className="flow-link" d={link.d} style={{ stroke: `var(--app-${link.app})` }} />
          {reduced ? null : (
            <g className="flow-arrow" style={{ fill: `var(--app-${link.app})` }}>
              <path d={ARROW_PATH} transform="scale(0.17) translate(-11.5 -34.5)" />
              <animateMotion dur={`${2.6 + (index % 4) * 0.35}s`} begin={`${(index * 0.47) % 2.4}s`} repeatCount="indefinite" rotate="auto" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1">
                <mpath href={`#${id}-${link.key}`} />
              </animateMotion>
            </g>
          )}
        </g>
      ))}

      {left.map((name, index) => (
        <g key={name} className="flow-chip" transform={`translate(18 ${leftY(index) - 18})`}>
          <rect width="150" height="36" rx="9" />
          <text x="14" y="23">{name}</text>
        </g>
      ))}

      {APPS.map((app, index) => (
        <g key={app.id} className="flow-app" transform={`translate(224 ${appY(index) - 27})`}>
          <rect width="122" height="54" rx="14" />
          <rect x="12" y="13" width="28" height="28" rx="8" style={{ fill: `var(--app-${app.id})` }} />
          <text className="flow-app-mark" x="26" y="31.5" textAnchor="middle">
            {app.mark}
          </text>
          <text x="50" y="32">{app.name}</text>
        </g>
      ))}

      {right.map((name, index) => (
        <g key={name} className="flow-chip" transform={`translate(402 ${rightY(index) - 18})`}>
          <rect width="140" height="36" rx="9" />
          <text x="14" y="23">{name}</text>
        </g>
      ))}

      <text className="flow-label" x="18" y="24">
        Skills
      </text>
      <text className="flow-label" x="224" y="24">
        Your AI apps
      </text>
      <text className="flow-label" x="402" y="24">
        Tools
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Sections

function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <a href="#top" className="nav-logo" aria-label="Skillhub, back to top">
          <Logo height={22} />
        </a>
        <nav aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#install">Install</a>
        </nav>
        <div className="nav-actions">
          <a className="nav-quiet" href={REPO} target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          <a className="btn btn-primary" href="#install">
            Get Skillhub <Arrow size={11} />
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const skill = SKILLS[0];
  return (
    <section className="hero" id="top">
      <div className="hero-text">
        <p className="eyebrow">
          <Arrow size={11} /> Skills for your AI agents
        </p>
        <h1>
          Your AI is as good as the <em>skills</em> you give it.
        </h1>
        <p className="lede">
          Skillhub finds good skills for Claude Code, Codex, Cursor and the rest, shows which of your apps has what, and connects them in one move.
        </p>
        <div className="hero-cta">
          <MagneticLink href="#install" className="btn btn-primary btn-lg">
            Install Skillhub <Arrow size={12} />
          </MagneticLink>
          <a href="#how" className="btn btn-lg">
            See how it works
          </a>
        </div>
        <ul className="hero-facts">
          <li>Runs on your computer</li>
          <li>Open source</li>
          <li>Nothing changes without your yes</li>
        </ul>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="map-card">
          <FlowMap id="hero" />
        </div>
        <div className="float-card">
          <div className="mini-head">
            <span className="glyph glyph-design">fr</span>
            <div>
              <strong>{skill.name}</strong>
              <span>{skill.owner}</span>
            </div>
          </div>
          <div className="mini-foot">
            <span className="tag">{skill.tag}</span>
            <span className="mini-count">{skill.installs} installs</span>
            <span className="btn btn-primary btn-sm">Install</span>
          </div>
        </div>
        <div className="toast">
          <span className="toast-dot" />
          Linked into Cursor
        </div>
      </div>
    </section>
  );
}

/** A photo slot. Shows public/people/<slot>.jpg when it exists, a drawn placeholder until then. */
function Photo({ slot, alt }: { slot: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <div className="photo">
      <div className="photo-fallback" aria-hidden="true">
        <Arrow size={54} />
        <span>{slot.replace('-', ' ')}</span>
      </div>
      {missing ? null : <img src={`./people/${slot}.jpg`} alt={alt} loading="lazy" onError={() => setMissing(true)} />}
    </div>
  );
}

function People() {
  // The row is doubled so the loop has no seam; the second copy is hidden from assistive tech.
  const row = [...PEOPLE, ...PEOPLE];
  return (
    <section className="people" aria-labelledby="people-title">
      <Reveal className="section-head">
        <h2 id="people-title">Nobody is born good at it.</h2>
        <p>A skier drills turns. An illustrator practises line. An accountant learns the ledger. Your AI gets good the same way: one skill at a time.</p>
      </Reveal>
      <div className="band">
        <div className="band-track">
          {row.map((person, index) => (
            <figure key={`${person.slot}-${index}`} className={`person person-${person.shape}`} aria-hidden={index >= PEOPLE.length}>
              <Photo slot={person.slot} alt={`${person.who} at work`} />
              <figcaption>
                <strong>{person.who}</strong> {person.learns}.
                <span className="learns">
                  <Arrow size={9} /> Your AI: <code>{person.skill}</code>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScanDemo() {
  const rows = ['Claude Code', 'Codex', 'Cursor', 'Antigravity'];
  return (
    <div className="demo demo-scan">
      <div className="demo-bar">
        <Marching size={11} /> Looking for AI apps
      </div>
      <ul>
        {rows.map((row, index) => (
          <li key={row} style={{ animationDelay: `${index * 0.5}s` }}>
            <span className="tile" style={{ background: `var(--app-${row.toLowerCase().replace(' ', '-')}, var(--text-3))` }} />
            {row}
            <span className="found">found</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DragDemo() {
  return (
    <div className="demo demo-drag">
      <div className="drag-skill">code-review</div>
      <div className="drag-track" aria-hidden="true">
        <svg className="drag-line" viewBox="0 0 200 40" preserveAspectRatio="none">
          <path d="M0 20 H200" />
        </svg>
        <span className="drag-runner">
          <Arrow size={9} />
        </span>
      </div>
      <div className="drag-app">
        <span className="tile" style={{ background: 'var(--app-cursor)' }} />
        Cursor
      </div>
      <div className="drag-confirm">
        <strong>Add code-review to Cursor</strong>
        <span>Creates a link in ~/.cursor/skills</span>
        <span className="btn btn-primary btn-sm">Apply 1</span>
      </div>
    </div>
  );
}

function How() {
  return (
    <section className="how" id="how" aria-labelledby="how-title">
      <div className="how-intro">
        <Reveal>
          <p className="eyebrow">
            <Arrow size={11} /> How it works
          </p>
          <h2 id="how-title">Look, see, connect.</h2>
          <p>Three steps, and the first two need nothing from you.</p>
        </Reveal>
      </div>
      <ol className="steps">
        <li>
          <Reveal className="step">
            <div className="step-text">
              <span className="step-no">1</span>
              <h3>It looks at your computer</h3>
              <p>Skillhub finds the AI apps you have and reads their settings: which skills each one loads, and which tools it can reach. It only reads.</p>
            </div>
            <ScanDemo />
          </Reveal>
        </li>
        <li>
          <Reveal className="step step-flip">
            <div className="step-text">
              <span className="step-no">2</span>
              <h3>It draws what is connected to what</h3>
              <p>One map for everything. A skill three apps share is one dot with three lines, so you can see what is missing where at a glance.</p>
            </div>
            <div className="demo demo-map">
              <FlowMap id="how" />
            </div>
          </Reveal>
        </li>
        <li>
          <Reveal className="step">
            <div className="step-text">
              <span className="step-no">3</span>
              <h3>You connect with one drag</h3>
              <p>Pull the arrow from a skill onto an app. Skillhub shows exactly what will change and waits. Nothing happens until you press the button.</p>
            </div>
            <DragDemo />
          </Reveal>
        </li>
      </ol>
    </section>
  );
}

const PROMPTS = ['Add my design skills to Cursor', 'What is Antigravity missing?', 'Find a skill for testing', 'Show only what my apps share'];

function CommandDemo() {
  const reduced = useReducedMotion();
  const [text, setText] = useState(reduced ? PROMPTS[0] : '');
  const [answered, setAnswered] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    let prompt = 0;
    let length = 0;
    let timer: number;
    function type() {
      const full = PROMPTS[prompt];
      length += 1;
      setText(full.slice(0, length));
      if (length < full.length) {
        timer = window.setTimeout(type, 42);
        return;
      }
      timer = window.setTimeout(() => {
        setAnswered(true);
        timer = window.setTimeout(() => {
          setAnswered(false);
          setText('');
          length = 0;
          prompt = (prompt + 1) % PROMPTS.length;
          timer = window.setTimeout(type, 500);
        }, 2600);
      }, 500);
    }
    timer = window.setTimeout(type, 700);
    return () => window.clearTimeout(timer);
  }, [reduced]);
  return (
    <div className="cell-art art-command">
      <div className="command">
        <span>{text}</span>
        <i className="caret" />
      </div>
      <div className={`answer ${answered ? 'answer-on' : ''}`}>
        <p>I can do that. Here is what would change.</p>
        <span className="btn btn-primary btn-sm">Review 3 changes</span>
      </div>
    </div>
  );
}

function ControlDemo() {
  const reduced = useReducedMotion();
  const rows = ['Claude Code', 'Codex', 'Cursor', 'This project'];
  const [on, setOn] = useState([true, true, false, false]);
  useEffect(() => {
    if (reduced) return;
    let step = 0;
    const order = [2, 3, 1, 2, 3, 1];
    const timer = window.setInterval(() => {
      const index = order[step % order.length];
      step += 1;
      setOn((current) => current.map((value, position) => (position === index ? !value : value)));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [reduced]);
  return (
    <div className="cell-art art-control">
      <div className="control-title">frontend-design</div>
      {rows.map((row, index) => (
        <div key={row} className="control-row">
          <span>{row}</span>
          <span className={`switch ${on[index] ? 'switch-on' : ''}`}>
            <i />
          </span>
        </div>
      ))}
    </div>
  );
}

function Features() {
  const rail = [...SKILLS, ...SKILLS];
  const bars = [34, 52, 28, 71, 44, 88, 60, 39, 76, 95, 58, 81];
  return (
    <section className="features" id="features" aria-labelledby="features-title">
      <Reveal className="section-head">
        <p className="eyebrow">
          <Arrow size={11} /> What you get
        </p>
        <h2 id="features-title">Find it. Place it. Keep track.</h2>
      </Reveal>

      <div className="bento">
        <Reveal className="cell cell-wide">
          <div className="cell-art art-rail" aria-hidden="true">
            <div className="rail-track">
              {rail.map((skill, index) => (
                <div key={`${skill.name}-${index}`} className="mini">
                  <div className="mini-head">
                    <span className="glyph">{skill.name.slice(0, 2)}</span>
                    <div>
                      <strong>{skill.name}</strong>
                      <span>{skill.owner}</span>
                    </div>
                  </div>
                  <div className="mini-foot">
                    <span className="tag">{skill.tag}</span>
                    <span className="mini-count">{skill.installs}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <h3>Suggestions that fit what you do</h3>
          <p>Skillhub looks at the skills you already use and shows the most installed ones in the same topics, plus a couple next door.</p>
        </Reveal>

        <Reveal className="cell cell-narrow" delay={80}>
          <CommandDemo />
          <h3>Ask in plain words</h3>
          <p>The assistant turns a sentence into a list of changes. It proposes, you confirm.</p>
        </Reveal>

        <Reveal className="cell cell-narrow">
          <ControlDemo />
          <h3>Every app, every project</h3>
          <p>Open a skill and decide where it lives: which apps get it, and which projects carry their own copy.</p>
        </Reveal>

        <Reveal className="cell cell-wide" delay={80}>
          <div className="cell-art art-usage" aria-hidden="true">
            <div className="bars">
              {bars.map((height, index) => (
                <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 0.12}s` }} />
              ))}
            </div>
            <div className="meter">
              <div className="meter-head">
                <span>5-hour window</span>
                <strong>62% left</strong>
              </div>
              <div className="meter-track">
                <i />
              </div>
            </div>
          </div>
          <h3>See what it costs</h3>
          <p>Tokens per day, per model and per project, and how much of each limit is left, for the apps that keep a record.</p>
        </Reveal>
      </div>

      <Reveal className="promises">
        <div>
          <h3>You confirm every change</h3>
          <p>Before anything is touched, you see the exact file or command.</p>
        </div>
        <div>
          <h3>Backups first</h3>
          <p>Settings are copied before an edit. Skill folders are moved, never deleted.</p>
        </div>
        <div>
          <h3>Your secrets stay put</h3>
          <p>Keys and tokens are never shown, never sent, never read out of your settings.</p>
        </div>
      </Reveal>
    </section>
  );
}

function WorksWith() {
  const row = [...WORKS_WITH, ...WORKS_WITH];
  return (
    <section className="works" aria-labelledby="works-title">
      <h2 id="works-title">Works with the AI apps you already have</h2>
      <div className="works-band">
        <div className="works-track">
          {row.map((name, index) => (
            <span key={`${name}-${index}`} aria-hidden={index >= WORKS_WITH.length}>
              {name}
              <Arrow size={10} />
            </span>
          ))}
        </div>
      </div>
      <p className="fine">ChatGPT keeps its setup in your account, not on your computer, so Skillhub can show that it is installed but not what it is connected to.</p>
    </section>
  );
}

function CopyBlock({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="code">
      <pre>
        {lines.map((line) => (
          <span key={line}>
            <i aria-hidden="true">$</i> {line}
            {'\n'}
          </span>
        ))}
      </pre>
      <button type="button" className="btn btn-sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Install() {
  return (
    <section className="install" id="install" aria-labelledby="install-title">
      <Reveal className="install-intro">
        <p className="eyebrow">
          <Arrow size={11} /> Install
        </p>
        <h2 id="install-title">Up and running in about two minutes.</h2>
        <p>Skillhub is a small app that runs on your own computer and opens in your browser. There is nothing to sign up for.</p>
        <a className="btn" href={REPO} target="_blank" rel="noreferrer noopener">
          View the code on GitHub <Arrow size={11} />
        </a>
      </Reveal>

      {/* Draft instructions: these are the steps that work from source today. Replace when a packaged download exists. */}
      <ol className="install-steps">
        <li>
          <Reveal>
            <h3>Check that you have Node.js</h3>
            <p>
              Version 22.13 or newer. If you are not sure, get it from{' '}
              <a href="https://nodejs.org" target="_blank" rel="noreferrer noopener">
                nodejs.org
              </a>
              .
            </p>
          </Reveal>
        </li>
        <li>
          <Reveal>
            <h3>Download Skillhub and start it</h3>
            <p>Paste these into the Terminal app.</p>
            <CopyBlock lines={['git clone https://github.com/hu-bill/Skillhub.git', 'cd Skillhub/dashboard', 'npm install', 'npm run dev']} />
          </Reveal>
        </li>
        <li>
          <Reveal>
            <h3>Open it</h3>
            <p>
              Go to <code>http://127.0.0.1:5177</code> in your browser. Skillhub looks at your computer and shows what it found.
            </p>
          </Reveal>
        </li>
        <li>
          <Reveal>
            <h3>Try these first</h3>
            <ul className="first">
              <li>
                <strong>Explore.</strong> Search for something you want your AI to be good at, and press Install.
              </li>
              <li>
                <strong>My skills.</strong> Click a card to choose which apps and projects get it.
              </li>
              <li>
                <strong>Map.</strong> Drag an arrow onto an app to connect, click a line to disconnect.
              </li>
              <li>
                <strong>Ask.</strong> Type what you want. Add a free Gemini key to switch the assistant on.
              </li>
            </ul>
            <p className="fine">Only want a look? <code>npm run demo</code> opens Skillhub with made-up data instead of your own.</p>
          </Reveal>
        </li>
      </ol>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-cta">
        <Logo height={40} />
        <p>Skills for your AI agents.</p>
        <a className="btn btn-primary btn-lg" href="#install">
          Install Skillhub <Arrow size={12} />
        </a>
      </div>
      <div className="footer-row">
        <span>Runs on your computer. Open source.</span>
        <a href={REPO} target="_blank" rel="noreferrer noopener">
          GitHub
        </a>
        <span className="fine">Skills shown are real listings on skills.sh. Install counts are from November 2026.</span>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <People />
        <How />
        <Features />
        <WorksWith />
        <Install />
      </main>
      <Footer />
    </>
  );
}
