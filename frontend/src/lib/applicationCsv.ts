import type { ApplicationItem } from './employerApi';

export function csvCell(value: string): string {
  // Spreadsheet apps may ignore whitespace before a formula trigger.
  const safe = /^\s*[=+@-]|^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function applicationCsv(
  applications: ApplicationItem[],
  translate: (key: string) => string,
  formatDate: (date: string) => string,
): string {
  const prefix = 'employer.candidatesTab';
  const headers = ['name', 'email', 'job', 'status', 'appliedAt', 'cvUrl', 'aiScore', 'aiStatus']
    .map((key) => translate(`${prefix}.csv.${key}`));
  const rows = applications.map((app) => {
    const score = app.aiScore;
    const percentage = score?.status === 'COMPLETED' &&
      typeof score.overallScore === 'number' && Number.isFinite(score.overallScore) &&
      score.overallScore >= 0 && score.overallScore <= 1
      ? `${Math.round(score.overallScore * 100)}%` : '';
    return [
      app.userId?.name || '', app.userId?.email || '', app.jobId?.name || '',
      app.status, formatDate(app.createdAt), app.cvId?.url || '', percentage,
      translate(`${prefix}.aiScoreStatus.${score?.status ?? 'MISSING'}`),
    ];
  });
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
