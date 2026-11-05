import type { TemplateDocument } from '@magic-resume-kit/resume-templates';
import type { Resume } from '@/types/frontend/resume';

/** Preview, acceptance and PDF must use the same facts, font and template. */
export function designCandidate(resume: Resume, template: TemplateDocument): Resume {
  return { ...resume, templateOverride: template, typography: 'source-han-sans', customTemplate: { ...resume.customTemplate, designTokens: { ...resume.customTemplate?.designTokens, typography: { ...resume.customTemplate?.designTokens?.typography, fontFamily: { primary: '"Source Han Sans SC", sans-serif' } } } } };
}
