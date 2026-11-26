export enum CVParseStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export function isParseTransitionAllowed(
  from: CVParseStatus,
  to: CVParseStatus,
): boolean {
  const transitions: Record<CVParseStatus, CVParseStatus[]> = {
    [CVParseStatus.PENDING]: [CVParseStatus.PROCESSING, CVParseStatus.FAILED],
    [CVParseStatus.PROCESSING]: [CVParseStatus.READY, CVParseStatus.FAILED],
    [CVParseStatus.READY]: [CVParseStatus.PROCESSING],
    [CVParseStatus.FAILED]: [CVParseStatus.PROCESSING],
  };
  return transitions[from].includes(to);
}
