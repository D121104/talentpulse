import {
  AiServiceError,
  JobIndexIdentity,
  assertExactKeys,
  isOptionalText,
  isRecord,
  isSafeString,
  isString,
  isUuid,
  isVersion,
} from './ai-service.common';

export interface CvDraftCandidateExperience {
  company_name: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}
export interface CvDraftCandidateEducation {
  school_name: string | null;
  degree: string | null;
  major: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}
export interface CvDraftCandidateProject {
  project_name: string;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  technologies: string[];
}
export interface CvDraftProject extends CvDraftCandidateProject {
  source_index: number;
  bullets: string[];
}

function ownedSkillVariants(literal: string): string[] {
  const pairs = [
    ['Good communication', 'Giao tiếp tốt'],
    ['Problem Solving', 'Giải quyết vấn đề'],
    ['Team collaboration', 'Hợp tác nhóm'],
    ['English', 'Tiếng Anh'],
  ];
  const key = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLowerCase();
  const parts = literal.match(/^(\s*)([^()]*?)(\s*\([^()]*\))?(\s*)$/);
  if (!parts) return [literal];
  const [, leading, label, suffix = '', trailing] = parts;
  const pair = pairs.find((values) =>
    values.some((value) => key(value) === key(label)),
  );
  if (!pair) return [literal];
  const sourceIndex = pair.findIndex((value) => key(value) === key(label));
  return [literal, `${leading}${pair[1 - sourceIndex]}${suffix}${trailing}`];
}

export function matchOwnedSkillMembers(
  text: string,
  owned: string[],
  translatable: string[] = owned,
): string[] | null {
  const literals = [...new Set(owned)]
    .filter(Boolean)
    .flatMap((original) =>
      (translatable.includes(original)
        ? ownedSkillVariants(original)
        : [original]
      ).map((display) => ({ original, display })),
    )
    .sort((a, b) => b.display.length - a.display.length);
  const memo = new Map<number, string[] | null>();
  const match = (offset: number): string[] | null => {
    if (offset === text.length) return [];
    if (memo.has(offset)) return memo.get(offset) ?? null;
    for (const { original, display } of literals) {
      if (!text.startsWith(display, offset)) continue;
      const end = offset + display.length;
      if (end === text.length) return [original];
      if (!text.startsWith('; ', end)) continue;
      const rest = match(end + 2);
      if (rest) return [original, ...rest];
    }
    memo.set(offset, null);
    return null;
  };
  return match(0);
}

export function ownedSkillLiterals(candidate: CvDraftCandidate): string[] {
  return [
    ...candidate.skills,
    ...candidate.certificates.filter((value) =>
      /\b(?:toeic|ielts|toefl)\b/i.test(value),
    ),
  ];
}
export interface CvDraftCandidate {
  candidate_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  link: string | null;
  address: string | null;
  headline: string | null;
  career_objective: string | null;
  skills: string[];
  experience: CvDraftCandidateExperience[];
  education: CvDraftCandidateEducation[];
  projects: CvDraftCandidateProject[];
  certificates: string[];
  activities: string[];
  awards: string[];
}
export interface CvDraftJob {
  job_id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  location: string | null;
  work_mode: string | null;
  level: string | null;
  required_skills: string[];
  preferred_skills: string[];
}
export interface CvDraftRequest {
  identity: JobIndexIdentity;
  candidate: CvDraftCandidate;
  job: CvDraftJob;
  template_type: 'template1' | 'template2';
  locale: string;
  source_version: string;
  content_version: number;
  consent_version?: string | null;
}
export interface CvDraftResponse {
  request_id: string;
  trace_id: string;
  operation_attempt_id: string;
  candidate_id: string;
  target_job_id: string;
  template_type: 'template1' | 'template2';
  generation_mode: 'EDITOR_ONLY';
  full_name: string;
  title: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  link: string | null;
  address: string | null;
  career_objective: string | null;
  education: CvDraftCandidateEducation[];
  projects: CvDraftProject[];
  work_experience: Array<
    CvDraftCandidateExperience & { source_index: number; bullets: string[] }
  >;
  skills: Array<{ name: string; description: string | null }>;
  activities: string[];
  certificates: string[];
  awards: string[];
  section_order: string[];
  warnings: string[];
  generated_by: string;
  source_version: string;
  content_version: number;
}

export function validateCvDraftRequest(request: CvDraftRequest): void {
  if (
    !isRecord(request) ||
    !isRecord(request.identity) ||
    !isRecord(request.candidate) ||
    !isRecord(request.job)
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid CV draft request');
  }
  assertExactKeys(request, [
    'identity',
    'candidate',
    'job',
    'template_type',
    'locale',
    'source_version',
    'content_version',
    'consent_version',
  ]);
  assertExactKeys(request.identity, [
    'request_id',
    'trace_id',
    'operation_attempt_id',
  ]);
  if (
    !isUuid(request.identity.request_id) ||
    !isUuid(request.identity.trace_id) ||
    !isUuid(request.identity.operation_attempt_id) ||
    !['template1', 'template2'].includes(request.template_type) ||
    !isString(request.locale) ||
    !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(request.locale) ||
    !isVersion(request.source_version) ||
    !Number.isInteger(request.content_version) ||
    request.content_version < 1 ||
    request.content_version > 2147483647 ||
    (request.consent_version != null && !isVersion(request.consent_version))
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid CV draft request');
  }
  validateCvDraftCandidate(request.candidate, 'request');
  validateCvDraftJob(request.job);
}

function validateCvDraftCandidate(value: unknown, context: string): void {
  if (!isRecord(value))
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      `Invalid CV draft ${context}`,
    );
  assertExactKeys(value, [
    'candidate_id',
    'full_name',
    'email',
    'phone',
    'link',
    'address',
    'headline',
    'career_objective',
    'skills',
    'experience',
    'education',
    'projects',
    'certificates',
    'activities',
    'awards',
  ]);
  if (!isUuid(value.candidate_id) || !isSafeString(value.full_name, 1, 500))
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      `Invalid CV draft ${context}`,
    );
  for (const field of [
    'email',
    'phone',
    'link',
    'address',
    'headline',
    'career_objective',
  ] as const) {
    if (
      !isOptionalText(value[field], field === 'career_objective' ? 2000 : 500)
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
  }
  for (const field of [
    'skills',
    'certificates',
    'activities',
    'awards',
  ] as const) {
    const entries = value[field];
    if (
      !Array.isArray(entries) ||
      entries.length > (field === 'skills' ? 100 : 50) ||
      entries.some((item) => !isSafeString(item, 1, 500))
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
  }
  const validateEntries = (field: string, keys: string[], maxItems: number) => {
    const entries = value[field];
    if (!Array.isArray(entries) || entries.length > maxItems)
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
    for (const entry of entries) {
      if (!isRecord(entry))
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          `Invalid CV draft ${context}`,
        );
      assertExactKeys(entry, keys);
      if (
        Object.values(entry).some(
          (item) => item !== null && !isSafeString(item, 1, 2000),
        )
      )
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          `Invalid CV draft ${context}`,
        );
    }
  };
  validateEntries(
    'experience',
    ['company_name', 'position', 'start_date', 'end_date', 'description'],
    50,
  );
  validateEntries(
    'education',
    ['school_name', 'degree', 'major', 'start_date', 'end_date', 'description'],
    50,
  );
  const projects = value.projects;
  if (!Array.isArray(projects) || projects.length > 50) {
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      `Invalid CV draft ${context}`,
    );
  }
  for (const project of projects) {
    if (!isRecord(project)) {
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
    }
    assertExactKeys(project, [
      'project_name',
      'role',
      'start_date',
      'end_date',
      'description',
      'technologies',
    ]);
    if (
      Object.entries(project).some(([key, item]) =>
        key === 'technologies'
          ? !Array.isArray(item) ||
            item.length > 30 ||
            item.some((technology) => !isSafeString(technology, 1, 500))
          : key === 'project_name'
          ? !isSafeString(item, 1, 500)
          : item !== null && !isSafeString(item, 1, 2000),
      )
    ) {
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `Invalid CV draft ${context}`,
      );
    }
  }
}

function validateCvDraftJob(value: unknown): void {
  if (!isRecord(value))
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid CV draft request');
  assertExactKeys(value, [
    'job_id',
    'title',
    'company_name',
    'description',
    'location',
    'work_mode',
    'level',
    'required_skills',
    'preferred_skills',
  ]);
  if (!isUuid(value.job_id) || !isSafeString(value.title, 1, 500))
    throw new AiServiceError('AI_INVALID_RESPONSE', 'Invalid CV draft request');
  for (const field of [
    'company_name',
    'description',
    'location',
    'work_mode',
    'level',
  ] as const)
    if (!isOptionalText(value[field], 8000))
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft request',
      );
  for (const field of ['required_skills', 'preferred_skills'] as const) {
    const skills = value[field];
    if (
      !Array.isArray(skills) ||
      skills.length > 100 ||
      skills.some((item) => !isSafeString(item, 1, 500))
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft request',
      );
  }
}

export function validateCvDraftResponse(
  value: unknown,
  request: CvDraftRequest,
): CvDraftResponse {
  if (!isRecord(value))
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid CV draft response',
    );
  assertExactKeys(value, [
    'request_id',
    'trace_id',
    'operation_attempt_id',
    'candidate_id',
    'target_job_id',
    'template_type',
    'generation_mode',
    'full_name',
    'title',
    'position',
    'email',
    'phone',
    'link',
    'address',
    'career_objective',
    'education',
    'projects',
    'work_experience',
    'skills',
    'activities',
    'certificates',
    'awards',
    'section_order',
    'warnings',
    'generated_by',
    'source_version',
    'content_version',
  ]);
  if (
    value.request_id !== request.identity.request_id ||
    value.trace_id !== request.identity.trace_id ||
    value.operation_attempt_id !== request.identity.operation_attempt_id ||
    value.candidate_id !== request.candidate.candidate_id ||
    value.target_job_id !== request.job.job_id ||
    value.template_type !== request.template_type ||
    value.generation_mode !== 'EDITOR_ONLY' ||
    value.source_version !== request.source_version ||
    value.content_version !== request.content_version ||
    !isUuid(value.request_id) ||
    !isUuid(value.trace_id) ||
    !isUuid(value.operation_attempt_id) ||
    !isUuid(value.candidate_id) ||
    !isUuid(value.target_job_id) ||
    !isSafeString(value.full_name, 1, 500) ||
    !isSafeString(value.title, 1, 500) ||
    !isOptionalText(value.position, 500) ||
    !isOptionalText(value.email, 500) ||
    !isOptionalText(value.phone, 500) ||
    !isOptionalText(value.link, 500) ||
    !isOptionalText(value.address, 500) ||
    !isOptionalText(value.career_objective, 2000) ||
    !isVersion(value.source_version) ||
    !isSafeString(value.generated_by, 1, 128) ||
    !Number.isInteger(value.content_version) ||
    !Array.isArray(value.section_order) ||
    value.section_order.length > 8 ||
    value.section_order.some((item) => !isString(item)) ||
    !Array.isArray(value.warnings) ||
    value.warnings.length > 20 ||
    value.warnings.some((warning) => !isSafeString(warning, 1, 500))
  )
    throw new AiServiceError(
      'AI_INVALID_RESPONSE',
      'Invalid CV draft response',
    );
  validateCvDraftCandidate(
    {
      candidate_id: value.candidate_id,
      full_name: value.full_name,
      email: value.email,
      phone: value.phone,
      link: value.link,
      address: value.address,
      headline: value.position,
      career_objective: value.career_objective,
      skills: (value.skills as unknown[]).map((skill) =>
        isRecord(skill) ? skill.name : null,
      ),
      experience: (value.work_experience as unknown[]).map((experience) => {
        if (!isRecord(experience)) return experience;
        const {
          bullets: _bullets,
          source_index: _sourceIndex,
          ...source
        } = experience;
        return source;
      }),
      education: value.education,
      projects: (value.projects as unknown[]).map((project) => {
        if (!isRecord(project)) return project;
        const {
          bullets: _bullets,
          source_index: _sourceIndex,
          ...source
        } = project;
        return source;
      }),
      certificates: value.certificates,
      activities: value.activities,
      awards: value.awards,
    },
    'response',
  );
  for (const skill of value.skills as unknown[]) {
    if (
      !isRecord(skill) ||
      !isSafeString(skill.name, 1, 500) ||
      !isOptionalText(skill.description, 2000)
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft response',
      );
    assertExactKeys(skill, ['name', 'description']);
    if (skill.description) {
      if (
        !matchOwnedSkillMembers(
          skill.description as string,
          ownedSkillLiterals(request.candidate),
          request.candidate.skills,
        )
      ) {
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft skill membership',
        );
      }
    } else if (ownedSkillLiterals(request.candidate).length) {
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft skill membership',
      );
    }
  }
  for (const [entries, sourceCount] of [
    [value.work_experience, request.candidate.experience.length],
    [value.projects, request.candidate.projects.length],
  ] as Array<[unknown[], number]>) {
    const indices = new Set<number>();
    if (entries.length > 3)
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft selection',
      );
    for (const entry of entries) {
      if (
        !isRecord(entry) ||
        !Number.isInteger(entry.source_index) ||
        (entry.source_index as number) < 0 ||
        (entry.source_index as number) >= sourceCount ||
        indices.has(entry.source_index as number)
      ) {
        throw new AiServiceError(
          'AI_INVALID_RESPONSE',
          'Invalid CV draft selection',
        );
      }
      indices.add(entry.source_index as number);
    }
  }
  for (const experience of value.work_experience as unknown[]) {
    if (
      !isRecord(experience) ||
      !Array.isArray(experience.bullets) ||
      experience.bullets.length > 10 ||
      experience.bullets.some((item) => !isSafeString(item, 1, 2000))
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft response',
      );
    assertExactKeys(experience, [
      'source_index',
      'company_name',
      'position',
      'start_date',
      'end_date',
      'description',
      'bullets',
    ]);
  }
  for (const project of value.projects as unknown[]) {
    if (
      !isRecord(project) ||
      !Array.isArray(project.bullets) ||
      project.bullets.length > 10 ||
      project.bullets.some((item) => !isSafeString(item, 1, 2000))
    )
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        'Invalid CV draft response',
      );
    assertExactKeys(project, [
      'source_index',
      'project_name',
      'role',
      'start_date',
      'end_date',
      'description',
      'technologies',
      'bullets',
    ]);
  }
  return value as unknown as CvDraftResponse;
}
