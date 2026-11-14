// The detail panel for one skill: where it is, and full control over where it should be.
// Per app (the user-level folder each app reads) and per project (a copy inside the project).
// Every button opens the shell's confirmation dialog; nothing is changed from here directly.

import { useMemo, useState } from 'react';
import type { ActionRequest, SkillItem } from '../../../shared/schema.ts';
import { useShell } from '../../shell/context.ts';
import { AppMark, TagChip, appName, detectedApps, formatDate } from '../../shell/ui.tsx';
import styles from './detail.module.css';

export function SkillDetail({ skills }: { skills: SkillItem[] }) {
  const { snapshot, status, act } = useShell();
  const first = skills[0];
  const apps = detectedApps(snapshot);
  const projects = snapshot.slices.skills.projects;
  const [projectId, setProjectId] = useState(projects.find((project) => project.current)?.id ?? projects[0]?.id ?? '');
  const [projectApp, setProjectApp] = useState(apps.find((app) => app.projectSkillDir)?.id ?? '');

  const managed = first.origin.kind !== 'plugin' && first.origin.kind !== 'builtin';
  const userLevel = skills.filter((skill) => skill.scope === 'user');
  const inProjects = skills.filter((skill) => skill.scope === 'project');
  const source = userLevel[0] ?? first;
  const uses = Math.max(0, ...skills.map((skill) => skill.usageCount ?? 0));
  const lastUsed = skills.map((skill) => skill.lastUsedAt).filter(Boolean).sort().pop();
  const readOnly = !status.canWrite;

  const appRows = useMemo(
    () =>
      apps
        .filter((app) => app.userSkillDir || userLevel.some((skill) => skill.app === app.id))
        .map((app) => {
          const mine = userLevel.filter((skill) => skill.app === app.id);
          const own = mine.find((skill) => skill.origin.kind === 'user' || (app.userSkillDir && skill.path.startsWith(`${app.userSkillDir}/`)));
          return { app, has: mine.length > 0, own, via: own ? undefined : mine[0] };
        }),
    [apps, userLevel],
  );
  const missing = appRows.filter((row) => !row.has && row.app.userSkillDir);

  // One row per project folder the skill sits in, with the apps that read it there.
  const projectRows = useMemo(() => {
    const byPath = new Map<string, SkillItem[]>();
    for (const skill of inProjects) byPath.set(skill.path, [...(byPath.get(skill.path) ?? []), skill]);
    return [...byPath.values()];
  }, [inProjects]);

  const connect = (appIds: string[], preselect: boolean) =>
    act(
      appIds.map((app): ActionRequest => ({ type: 'skill.connect', skillId: source.id, app })),
      { title: `Add ${first.name}`, intro: preselect ? undefined : 'Pick the apps that should get it, or select all. Nothing has happened yet.', preselect },
    );
  const remove = (skill: SkillItem, from: string) => act([{ type: 'skill.disconnect', skillId: skill.id }], { title: `Remove ${first.name} from ${from}`, preselect: true });
  const addToProject = () => {
    const project = projects.find((item) => item.id === projectId);
    if (!project || !projectApp) return;
    act([{ type: 'skill.project.add', skillId: source.id, project: project.id, app: projectApp }], { title: `Add ${first.name} to ${project.name}`, preselect: true });
  };

  return (
    <div className={styles.detail}>
      <p className={styles.description}>{first.description || 'This skill has no description.'}</p>
      {first.tags.length > 0 ? (
        <div className="tag-row">
          {first.tags.map((tag) => (
            <TagChip key={tag} id={tag} />
          ))}
        </div>
      ) : null}

      <dl className={styles.facts}>
        <div>
          <dt>Always-on cost</dt>
          <dd>~{first.estTokens} tokens</dd>
        </div>
        <div>
          <dt>Used</dt>
          <dd>{uses > 0 ? `${uses} times` : 'no record'}</dd>
        </div>
        <div>
          <dt>Last used</dt>
          <dd>{lastUsed ? formatDate(lastUsed) : 'no record'}</dd>
        </div>
        <div>
          <dt>Starts on its own</dt>
          <dd>{first.modelInvocable ? 'yes' : 'no, by hand'}</dd>
        </div>
      </dl>

      {!managed ? (
        <p className={styles.note}>
          This skill came with {first.origin.kind === 'plugin' ? `the ${first.origin.name} plugin` : appName(snapshot, first.app)}, so it is managed there, not here.
        </p>
      ) : (
        <>
          <section>
            <div className={styles.sectionHead}>
              <h3>Apps</h3>
              {missing.length > 1 ? (
                <button type="button" className="btn" disabled={readOnly} onClick={() => connect(missing.map((row) => row.app.id), false)}>
                  Add to more apps
                </button>
              ) : null}
            </div>
            <ul className={styles.rows}>
              {appRows.map(({ app, has, own, via }) => (
                <li key={app.id} className={styles.row}>
                  <AppMark snapshot={snapshot} appId={app.id} size={26} />
                  <div className={styles.rowText}>
                    <strong>{app.name}</strong>
                    <span>{own ? own.path : via ? `reads it from ${via.path.split('/').slice(0, -1).join('/')}` : 'not added'}</span>
                  </div>
                  {own ? (
                    <button type="button" className="btn btn-danger" disabled={readOnly} onClick={() => remove(own, app.name)}>
                      Remove
                    </button>
                  ) : has ? (
                    <span className="badge">shared folder</span>
                  ) : (
                    <button type="button" className="btn btn-primary" disabled={readOnly} onClick={() => connect([app.id], true)}>
                      Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className={styles.sectionHead}>
              <h3>Projects</h3>
              <span className="faint">a project keeps its own copy</span>
            </div>
            {projectRows.length === 0 ? <p className={styles.note}>Not in any project yet.</p> : null}
            <ul className={styles.rows}>
              {projectRows.map((group) => (
                <li key={group[0].path} className={styles.row}>
                  <span className={styles.marks}>
                    {group.map((skill) => (
                      <AppMark key={skill.app} snapshot={snapshot} appId={skill.app} size={22} />
                    ))}
                  </span>
                  <div className={styles.rowText}>
                    <strong>{group[0].project ?? 'Project'}</strong>
                    <span>{group[0].path}</span>
                  </div>
                  <button type="button" className="btn btn-danger" disabled={readOnly} onClick={() => remove(group[0], group[0].project ?? 'the project')}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.add}>
              <select className="select" aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.current ? ' (current)' : ''}
                  </option>
                ))}
              </select>
              <select className="select" aria-label="For which app" value={projectApp} onChange={(event) => setProjectApp(event.target.value)}>
                {apps
                  .filter((app) => app.projectSkillDir)
                  .map((app) => (
                    <option key={app.id} value={app.id}>
                      for {app.name}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn btn-primary" disabled={readOnly || !projectId || !projectApp} onClick={addToProject}>
                Add to project
              </button>
            </div>
          </section>
        </>
      )}
      {readOnly ? <p className={styles.note}>Demo data is read-only.</p> : null}
    </div>
  );
}
