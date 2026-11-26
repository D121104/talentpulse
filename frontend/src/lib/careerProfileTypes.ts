export interface CareerExperienceEntry {
  companyName: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface CareerEducationEntry {
  schoolName: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface CareerProjectEntry {
  projectName: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  technologies: string;
}

export interface CareerCertificateEntry {
  name: string;
  issuer: string;
  date: string;
  credentialUrl: string;
}

export interface CareerSkillEntry {
  name: string;
  level: string;
  description?: string;
}

export interface CareerActivityEntry {
  organizationName: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface CareerAwardEntry {
  name: string;
  issuer: string;
  date: string;
  description: string;
}

export interface CandidateCareerProfile {
  _id?: string;
  contentVersion: number;
  fullName: string;
  email: string;
  phone: string;
  link: string;
  address: string;
  headline: string;
  careerObjective: string;
  experience: CareerExperienceEntry[];
  education: CareerEducationEntry[];
  projects: CareerProjectEntry[];
  certificates: CareerCertificateEntry[];
  skills: CareerSkillEntry[];
  activities: CareerActivityEntry[];
  awards: CareerAwardEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export type CandidateCareerProfileInput = Omit<
  CandidateCareerProfile,
  '_id' | 'createdAt' | 'updatedAt'
>;

function inputText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function inputTechnologies(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((technology): technology is string => typeof technology === 'string')
      .join(', ');
  }
  return inputText(value);
}

/**
 * Maps the editable profile state to the PUT contract.
 * Server response metadata and nested JSONB fields must never be sent back.
 */
export function mapCandidateCareerProfileToInput(
  profile: CandidateCareerProfile,
): CandidateCareerProfileInput {
  return {
    contentVersion: profile.contentVersion,
    fullName: inputText(profile.fullName),
    email: inputText(profile.email),
    phone: inputText(profile.phone),
    link: inputText(profile.link),
    address: inputText(profile.address),
    headline: inputText(profile.headline),
    careerObjective: inputText(profile.careerObjective),
    experience: (profile.experience ?? []).map((entry) => ({
      companyName: inputText(entry.companyName),
      position: inputText(entry.position),
      startDate: inputText(entry.startDate),
      endDate: inputText(entry.endDate),
      description: inputText(entry.description),
    })),
    education: (profile.education ?? []).map((entry) => ({
      schoolName: inputText(entry.schoolName),
      degree: inputText(entry.degree),
      major: inputText(entry.major),
      startDate: inputText(entry.startDate),
      endDate: inputText(entry.endDate),
      description: inputText(entry.description),
    })),
    projects: (profile.projects ?? []).map((entry) => ({
      projectName: inputText(entry.projectName),
      role: inputText(entry.role),
      startDate: inputText(entry.startDate),
      endDate: inputText(entry.endDate),
      description: inputText(entry.description),
      technologies: inputTechnologies(entry.technologies),
    })),
    certificates: (profile.certificates ?? []).map((entry) => ({
      name: inputText(entry.name),
      issuer: inputText(entry.issuer),
      date: inputText(entry.date),
      credentialUrl: inputText(entry.credentialUrl),
    })),
    skills: (profile.skills ?? []).map((entry) => ({
      name: inputText(entry.name),
      level: inputText(entry.level),
      ...(entry.description !== undefined ? { description: inputText(entry.description) } : {}),
    })),
    activities: (profile.activities ?? []).map((entry) => ({
      organizationName: inputText(entry.organizationName),
      position: inputText(entry.position),
      startDate: inputText(entry.startDate),
      endDate: inputText(entry.endDate),
      description: inputText(entry.description),
    })),
    awards: (profile.awards ?? []).map((entry) => ({
      name: inputText(entry.name),
      issuer: inputText(entry.issuer),
      date: inputText(entry.date),
      description: inputText(entry.description),
    })),
  };
}

export interface GenerateCareerProfileCvRequest {
  templateType: 'template1' | 'template2';
  jobId?: string;
  locale?: CareerProfileCvLocale;
  expectedProfileVersion?: number;
}

export type CareerProfileCvLocale = 'vi-VN' | 'en-US';
