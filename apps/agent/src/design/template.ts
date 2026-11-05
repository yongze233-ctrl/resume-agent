import { z } from 'zod';
import type { TemplateDocument, TemplateNode } from '@magic-resume-kit/resume-templates/core';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const designSpecSchema = z.object({
  direction: z.enum(['project-cover', 'portfolio-sidebar']),
  ink: color.default('#442537'),
  accent: color.default('#cd749f'),
  tint: color.default('#f8e7ef'),
  nameSize: z.number().min(48).max(84).default(68),
  bodySize: z.number().min(13.5).max(16).default(14),
  sectionGap: z.number().min(12).max(30).default(20),
  padding: z.number().min(28).max(48).default(38),
  featureProjectId: z.string().min(1),
  rationale: z.string().min(10).max(600),
  decisions: z.array(z.object({ zone: z.enum(['identity', 'projects', 'experience', 'support']), reason: z.string().min(5).max(220) })).min(3).max(6),
});
export type DesignSpec = z.infer<typeof designSpecSchema>;
type Style = Record<string, unknown>;

export function buildDesignTemplate(spec: DesignSpec): TemplateDocument {
  const box = (id: string, children: TemplateNode[], style: Style = {}): TemplateNode => ({ id, type: 'Box', style: [style], children });
  const label = (id: string, value: string, style: Style = {}): TemplateNode => ({ id, type: 'Text', value, style: [style] });
  const text = (id: string, read: string | string[], style: Style = {}): TemplateNode => ({ id, type: 'Text', value: { read }, style: [style] });
  const rich = (id: string, read: string | string[], style: Style = {}): TemplateNode => ({ id, type: 'RichText', value: { read }, style: [style] });
  const muted = '#766d72';
  const sectionLabel = (id: string, value: string) => label(id, value, { fontSize: 12, fontWeight: 700, marginBottom: 10, color: spec.ink });
  const summaryStyle = { fontSize: spec.bodySize, lineHeight: 1.65, marginTop: 8, color: spec.ink };
  const item = (prefix: string, titleKeys: string[], subtitleKeys: string[], featured = false): TemplateNode => box(prefix, [
    box(`${prefix}-head`, [text(`${prefix}-date`, 'date', { fontSize: 10, color: muted }), text(`${prefix}-location`, 'location', { fontSize: 10, color: muted })], { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }),
    text(`${prefix}-title`, titleKeys, { fontSize: featured ? 29 : 19, fontWeight: 700, lineHeight: 1.4, color: spec.ink }),
    text(`${prefix}-role`, subtitleKeys, { fontSize: 11, color: muted, marginTop: 5 }),
    rich(`${prefix}-summary`, ['summary', 'description'], summaryStyle),
  ], { marginBottom: 14 });
  const items = (id: string, path: string, node: TemplateNode, style: Style = {}): TemplateNode => ({ ...box(id, [node], style), each: { path } });
  const feature = items('featured-item', 'sections.projects', item('feature-content', ['name', 'project', 'title'], ['role', 'position'], true), { backgroundColor: spec.tint, padding: 20, marginBottom: 15 });
  feature.when = { equals: ['id', spec.featureProjectId] };
  const other = items('other-project', 'sections.projects', item('other-content', ['name', 'project', 'title'], ['role', 'position']), { paddingLeft: 20, borderLeftWidth: 3, borderColor: spec.accent });
  other.when = { not: { equals: ['id', spec.featureProjectId] } };
  const projects = box('design-projects', [sectionLabel('project-label', '代表项目'), feature, other], { marginTop: spec.sectionGap });
  const firstCareer = items('career-first-item', 'sections.experience', item('career-first-content', ['company', 'organization', 'name'], ['position', 'role']), { width: spec.direction === 'project-cover' ? '52%' : '100%' });
  firstCareer.when = { isFirst: true };
  const otherCareers = items('career-other-item', 'sections.experience', item('career-other-content', ['company', 'organization', 'name'], ['position', 'role']), { width: spec.direction === 'project-cover' ? '46%' : '100%' });
  otherCareers.when = { not: { isFirst: true } };
  const career = box('design-experience', [sectionLabel('experience-label', '工作经历'), {
    ...box('career-grid', [firstCareer, otherCareers], { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }),
  }], { marginTop: spec.sectionGap, borderTopWidth: 1, borderColor: '#d9cfd4', paddingTop: 12 });
  const education = box('education-area', [sectionLabel('education-label', '教育背景'), items('education-item', 'sections.education', box('education-content', [
    text('education-school', 'school', { fontSize: 13, fontWeight: 700 }),
    text('education-major', 'major', { fontSize: 12, marginTop: 6 }),
    text('education-degree', 'degree', { fontSize: 11, marginTop: 4 }),
    text('education-date', 'date', { fontSize: 10, marginTop: 6, color: muted }),
  ]))], { width: spec.direction === 'project-cover' ? '43%' : '100%' });
  const skills = box('skills-area', [sectionLabel('skills-label', '专业技能'), items('skills-item', 'sections.skills', text('skill-name', ['name', 'skill', 'title'], { fontSize: 11.5, lineHeight: 1.9, marginBottom: 7 }))], { width: spec.direction === 'project-cover' ? '53%' : '100%' });
  const support = box('design-support', [education, skills], { flexDirection: spec.direction === 'project-cover' ? 'row' : 'column', justifyContent: 'space-between', gap: 20, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#d9cfd4' });
  const contact = box('contact', [text('contact-phone', 'info.phoneNumber'), text('contact-email', 'info.email'), text('contact-address', 'info.address'), text('contact-website', 'info.website')], { flexDirection: 'row', flexWrap: 'wrap', gap: 16, fontSize: 11, color: muted, marginTop: 13 });
  const identity = box('design-identity', [label('resume-label', '个人履历', { fontSize: 10, color: muted, marginBottom: 16 }), text('identity-name', 'info.fullName', { fontSize: spec.nameSize, fontWeight: 700, lineHeight: 1.2, letterSpacing: -1.5 }), text('identity-headline', 'info.headline', { fontSize: 22, fontWeight: 700, marginTop: 12 }), contact], { paddingBottom: 16, borderBottomWidth: 2, borderColor: spec.accent });
  const extras = ['languages', 'certificates', 'profiles'].map((key) => ({ ...box(`${key}-area`, [sectionLabel(`${key}-label`, { languages: '语言', certificates: '证书', profiles: '个人主页' }[key] ?? key), items(`${key}-item`, `sections.${key}`, item(`${key}-content`, ['name', 'title', 'language', 'platform'], ['level', 'issuer']))], { marginTop: spec.sectionGap }), when: { exists: `sections.${key}` } } as TemplateNode));
  const catchAll = { ...box('custom-area', [text('custom-title', 'label', { fontSize: 14, fontWeight: 700 }), items('custom-items', 'items', item('custom-content', ['name', 'company', 'title', 'school'], ['role', 'position']))], { marginTop: spec.sectionGap }), each: { path: '$unhandledSections' } } as TemplateNode;
  const customInfo = items('custom-info', 'info.customFields', box('custom-info-pair', [text('custom-info-label', 'name'), text('custom-info-value', 'value')], { flexDirection: 'row', gap: 8, fontSize: 11, marginTop: 6 }));
  const body = spec.direction === 'project-cover' ? [identity, customInfo, projects, career, support, ...extras, catchAll] : [identity, customInfo, box('portfolio-columns', [box('portfolio-main', [projects, career], { width: '69%' }), box('portfolio-support', [support], { width: '26%', backgroundColor: spec.tint, padding: 16 })], { flexDirection: 'row', justifyContent: 'space-between', gap: 20, marginTop: 12 }), ...extras, catchAll];
  return { version: 1, page: { mode: 'paged', size: 'A4', margin: 0 }, root: box('resume-design', body, { width: '100%', padding: spec.padding, backgroundColor: '#ffffff', color: spec.ink, fontSize: spec.bodySize, lineHeight: 1.8 }) };
}
