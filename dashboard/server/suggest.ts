// Skill suggestions for the Explore page: good skills the user does not have yet.
//
// "Good" here means widely installed according to skills.sh. "For you" means in the topics the
// user's own skills already lean toward, plus a couple of neighbouring topics so the list widens
// what they know about rather than repeating it. Everything shown is an unvetted third-party listing.
//
// What leaves the machine: a handful of one-word topic searches (for example "design") sent to
// skills.sh, and requests for the public listing pages of the skills that come back.
// No skill names, paths or anything else about the setup is sent.

import type { DiscoverResult, HarnessSnapshot, SuggestionRail, Suggestions } from '../shared/schema.ts';
import { TAGS, tagLabel } from '../shared/tags.ts';
import { describeSkills, installedSkillNames, searchSkills } from './discover.ts';

const DEFAULT_INTERESTS = ['frontend', 'docs', 'testing'];
const WIDEN_WITH = ['agents', 'workflow', 'design', 'data', 'testing', 'docs', 'deploy', 'security'];
const PER_RAIL = 8;

/** Topics the user's skills lean toward. A skill they added counts for more than one a plugin brought. */
export function interestsOf(snapshot: HarnessSnapshot): string[] {
  const score = new Map<string, number>();
  const seen = new Set<string>();
  for (const skill of snapshot.slices.skills.items) {
    if (seen.has(skill.key)) continue;
    seen.add(skill.key);
    const weight = skill.origin.kind === 'plugin' || skill.origin.kind === 'builtin' ? 1 : 4;
    for (const tag of skill.tags) score.set(tag, (score.get(tag) ?? 0) + weight);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

let cache: { key: string; at: number; value: Suggestions } | undefined;
const CACHE_MS = 15 * 60 * 1000;

export async function suggest(snapshot: HarnessSnapshot, now = new Date()): Promise<Suggestions> {
  const today = now.toISOString().slice(0, 10);
  const installed = installedSkillNames(snapshot);
  const ranked = interestsOf(snapshot);
  const interests = (ranked.length > 0 ? ranked : DEFAULT_INTERESTS).slice(0, 3);
  const widen = WIDEN_WITH.filter((tag) => !interests.includes(tag)).slice(0, 2);
  const topics = [...interests, ...widen];

  const cacheKey = `${topics.join(',')}|${installed.size}`;
  if (cache && cache.key === cacheKey && now.getTime() - cache.at < CACHE_MS) return cache.value;

  const errors: string[] = [];
  const perTopic = new Map<string, DiscoverResult[]>();
  const settled = await Promise.allSettled(
    topics.map(async (topic) => {
      const tag = TAGS.find((entry) => entry.id === topic);
      const results = await searchSkills(tag?.query ?? topic, today, installed, 24);
      perTopic.set(
        topic,
        results
          .filter((result) => !result.installed)
          .map((result) => ({ ...result, tags: [...new Set([topic, ...result.tags])].slice(0, 3) }))
          .sort((a, b) => (b.installs ?? 0) - (a.installs ?? 0)),
      );
    }),
  );
  if (settled.some((outcome) => outcome.status === 'rejected')) errors.push('skills.sh could not be reached, so some suggestions are missing.');

  // "For you": take turns across the interest topics so one topic cannot fill the row.
  const used = new Set<string>();
  const forYou: DiscoverResult[] = [];
  for (let round = 0; forYou.length < PER_RAIL && round < 6; round += 1) {
    for (const topic of interests) {
      const next = (perTopic.get(topic) ?? []).find((result) => !used.has(result.id));
      if (!next || forYou.length >= PER_RAIL) continue;
      used.add(next.id);
      forYou.push(next);
    }
  }

  const rails: SuggestionRail[] = [];
  if (forYou.length > 0) {
    rails.push({
      id: 'for-you',
      title: 'Suggested for you',
      reason: `Popular skills in ${interests.map(tagLabel).join(', ')}, the topics your own skills lean toward.`,
      items: forYou,
    });
  }
  for (const topic of topics) {
    const items = (perTopic.get(topic) ?? []).filter((result) => !used.has(result.id)).slice(0, PER_RAIL);
    for (const item of items) used.add(item.id);
    if (items.length >= 3) {
      rails.push({
        id: topic,
        title: `Popular in ${tagLabel(topic)}`,
        reason: interests.includes(topic) ? 'More in a topic you already use.' : 'A topic you have little of yet.',
        items,
      });
    }
  }

  await describeSkills(rails.flatMap((rail) => rail.items));
  const value: Suggestions = { interests, rails, errors };
  if (rails.length > 0) cache = { key: cacheKey, at: now.getTime(), value };
  return value;
}
