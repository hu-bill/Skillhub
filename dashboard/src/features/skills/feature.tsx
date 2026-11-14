// Slice `skills`: the skills you already have, as cards. Which apps can use each one, where it came
// from (you, a project, a plugin, the app itself), its topic tags and how often it gets used.

import { useMemo, useState } from 'react';
import { alwaysOnTokens } from '../../../shared/insights.ts';
import type { SkillItem } from '../../../shared/schema.ts';
import { TAGS } from '../../../shared/tags.ts';
import { Arrow } from '../../shell/brand/Brand.tsx';
import { useShell, type FeatureDescriptor } from '../../shell/context.ts';
import { AppMark, Drawer, SkillCard, TagChip, appName, detectedApps } from '../../shell/ui.tsx';
import { SkillDetail } from './SkillDetail.tsx';
import styles from './skills.module.css';

type Group = 'yours' | 'project' | 'plugin' | 'builtin';
type GroupFilter = Group | 'all';

interface Row {
  key: string;
  group: Group;
  skill: SkillItem;
  apps: string[];
  projects: string[];
  uses?: number;
}

const GROUP_LABEL: Record<GroupFilter, string> = { yours: 'Yours', project: 'In projects', plugin: 'From plugins', builtin: 'Built in', all: 'All' };

function groupOf(skill: SkillItem): Group {
  if (skill.origin.kind === 'plugin') return 'plugin';
  if (skill.origin.kind === 'builtin') return 'builtin';
  if (skill.scope === 'project') return 'project';
  return 'yours';
}

function Skills() {
  const { snapshot, go } = useShell();
  const [query, setQuery] = useState('');
  const [app, setApp] = useState('all');
  const [group, setGroup] = useState<GroupFilter>('yours');
  const [tag, setTag] = useState<string>();
  const [open, setOpen] = useState<string>();
  const apps = detectedApps(snapshot);

  const rows = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const skill of snapshot.slices.skills.items) {
      const id = `${skill.key}:${groupOf(skill)}`;
      const row = byKey.get(id) ?? { key: id, group: groupOf(skill), skill, apps: [], projects: [] };
      if (!row.apps.includes(skill.app)) row.apps.push(skill.app);
      if (skill.project && !row.projects.includes(skill.project)) row.projects.push(skill.project);
      if (skill.usageCount !== undefined) row.uses = Math.max(row.uses ?? 0, skill.usageCount);
      byKey.set(id, row);
    }
    return [...byKey.values()].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || b.apps.length - a.apps.length || a.skill.name.localeCompare(b.skill.name));
  }, [snapshot]);

  const counts: Record<GroupFilter, number> = { yours: 0, project: 0, plugin: 0, builtin: 0, all: rows.length };
  for (const row of rows) counts[row.group] += 1;

  const needle = query.trim().toLowerCase();
  const inGroup = rows.filter(
    (row) =>
      (group === 'all' || row.group === group) &&
      (app === 'all' || row.apps.includes(app)) &&
      (!needle || row.skill.name.toLowerCase().includes(needle) || row.skill.description.toLowerCase().includes(needle)),
  );
  const presentTags = TAGS.filter((entry) => inGroup.some((row) => row.skill.tags.includes(entry.id)));
  const shown = tag ? inGroup.filter((row) => row.skill.tags.includes(tag)) : inGroup;
  const withSkills = apps.filter((item) => item.counts.skills > 0);

  // Everything that is the same skill, wherever it sits, so the panel can manage all of it.
  const openSkills = open ? snapshot.slices.skills.items.filter((skill) => skill.key === open) : [];

  function owner(row: Row): string {
    if (row.skill.origin.kind === 'plugin') return `${row.skill.origin.name} plugin`;
    if (row.group === 'builtin') return `Built into ${appName(snapshot, row.skill.app)}`;
    if (row.group === 'project') return `Project · ${row.projects.join(', ')}`;
    return 'Added by you';
  }

  return (
    <div>
      <div className={styles.budget} aria-label="Always-on cost per app">
        {withSkills.map((item) => (
          <span key={item.id} className={styles.budgetItem} title="Tokens of skill descriptions loaded into every session">
            <AppMark snapshot={snapshot} appId={item.id} size={20} />
            {item.name}
            <b>~{alwaysOnTokens(snapshot, item.id).toLocaleString('en-US')}</b> tokens always on
          </span>
        ))}
      </div>

      <div className={styles.filters}>
        <input className={`input ${styles.search}`} type="search" placeholder="Search your skills" aria-label="Search your skills" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className={styles.seg} role="group" aria-label="Where the skill came from">
          {(['yours', 'project', 'plugin', 'builtin', 'all'] as GroupFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={group === value}
              onClick={() => {
                setGroup(value);
                setTag(undefined);
              }}
            >
              {GROUP_LABEL[value]} <span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <select className="select" aria-label="App" value={app} onChange={(event) => setApp(event.target.value)}>
          <option value="all">All apps</option>
          {withSkills.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {presentTags.length > 1 ? (
        <div className={`tag-row ${styles.tags}`}>
          {presentTags.map((entry) => (
            <TagChip key={entry.id} id={entry.id} active={tag === entry.id} onClick={() => setTag(tag === entry.id ? undefined : entry.id)} />
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="card empty">
          <div className="empty-mark">
            <Arrow size={30} />
          </div>
          <div>Nothing here yet.</div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => go('explore')}>
              Find skills <Arrow size={11} />
            </button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {shown.slice(0, 120).map((row) => (
            <SkillCard
              key={row.key}
              name={row.skill.name}
              owner={owner(row)}
              description={row.skill.description}
              tags={row.skill.tags}
              onTag={(id) => setTag(tag === id ? undefined : id)}
              onOpen={() => setOpen(row.skill.key)}
              status={row.skill.modelInvocable ? undefined : 'Manual'}
              meta={
                <>
                  <span className={styles.marks}>
                    {row.apps.map((id) => (
                      <AppMark key={id} snapshot={snapshot} appId={id} size={20} />
                    ))}
                  </span>
                  {row.uses !== undefined ? `${row.uses} uses` : `~${row.skill.estTokens} tokens`}
                </>
              }
            />
          ))}
        </div>
      )}
      {shown.length > 120 ? <p className={styles.count}>Showing 120 of {shown.length}. Search or pick a tag to narrow it down.</p> : null}

      {openSkills.length > 0 ? (
        <Drawer title={openSkills[0].name} onClose={() => setOpen(undefined)}>
          <SkillDetail skills={openSkills} />
        </Drawer>
      ) : null}
    </div>
  );
}

export const feature: FeatureDescriptor = {
  id: 'skills',
  title: 'My skills',
  summary: 'Everything your AI apps can already do.',
  order: 10,
  Component: Skills,
};
