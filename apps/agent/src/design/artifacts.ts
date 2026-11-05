import { createHash, randomUUID } from 'node:crypto';
import { assertOwned, currentUserId } from '../auth/context.js';
import type { TemplateDocument } from '@magic-resume-kit/resume-templates/core';

export interface DesignStep { title: string; detail: string; status: 'running' | 'completed' | 'failed'; }
export interface DesignArtifact {
  ownerId?: string;
  id: string;
  resume: Record<string, unknown>;
  template: TemplateDocument;
  sourceHash: string;
  createdAt: number;
}
const artifacts = new Map<string, DesignArtifact>();
export function sourceHash(resume: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify({ info: resume.info, sections: resume.sections })).digest('hex');
}
export function putDesign(resume: Record<string, unknown>, template: TemplateDocument) {
  for (const [id, artifact] of artifacts) if (Date.now() - artifact.createdAt > 3_600_000) artifacts.delete(id);
  const artifact = { id: randomUUID(), ownerId: currentUserId(), resume, template, sourceHash: sourceHash(resume), createdAt: Date.now() };
  assertOwned('artifact',artifact.id,true);
  artifacts.set(artifact.id, artifact);
  return artifact;
}
export const getDesign = (id: string) => {
  assertOwned('artifact',id,false,true);
  const artifact = artifacts.get(id);
  return artifact?.ownerId === currentUserId() ? artifact : undefined;
};
