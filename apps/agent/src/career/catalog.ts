import { readFileSync } from 'node:fs';
import { z } from 'zod';

const catalogSchema = z.object({
  manifest: z.object({
    name: z.string(),
    author: z.string(),
    commit: z.string(),
  }),
  lessons: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      title: z.string(),
      topic: z.string(),
      part: z.string(),
      url: z.string().url(),
    }),
  ),
  abilities: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      keywords: z.array(z.string()),
      lessons: z.array(z.string()),
    }),
  ),
});
const catalog = catalogSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../../resources/learning-catalog.json', import.meta.url),
      'utf8',
    ),
  ),
);

export function findCourses(query: string, limit = 5) {
  const low = query.toLowerCase();
  const abilities = catalog.abilities
    .map((ability) => ({
      ...ability,
      hits: ability.keywords.filter((keyword) => {
        const word = keyword.toLowerCase();
        return /^[\x20-\x7E]+$/.test(word)
          ? new RegExp(
              `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            ).test(low)
          : low.includes(word);
      }),
    }))
    .filter((ability) => ability.hits.length);
  const terms = low.split(/[\s,，/、·]+/).filter((word) => word.length >= 2);
  return catalog.lessons
    .map((lesson) => {
      const related = abilities.filter((ability) =>
        ability.lessons.includes(lesson.file),
      );
      const titleHits = terms.filter((term) =>
        `${lesson.title} ${lesson.topic}`.toLowerCase().includes(term),
      );
      return {
        lesson,
        related,
        titleHits,
        rank:
          related.reduce((sum, ability) => sum + ability.hits.length, 0) +
          titleHits.length * 3,
      };
    })
    .filter((item) => item.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ lesson, related, titleHits }) => ({
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      url: `/dashboard/learning?lesson=${encodeURIComponent(lesson.id)}`,
      source: catalog.manifest.name,
      author: catalog.manifest.author,
      version: catalog.manifest.commit,
      matchedTopics: related.map((ability) => ability.label),
      matchedTerms: [
        ...new Set([
          ...titleHits,
          ...related.flatMap((ability) => ability.hits),
        ]),
      ].slice(0, 8),
    }));
}
