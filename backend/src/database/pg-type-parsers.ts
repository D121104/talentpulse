import { defaults, types } from 'pg';

let configured = false;

/**
 * Normalize PostgreSQL TIMESTAMP (OID 1114) and TIMESTAMPTZ (OID 1184) parsing
 * to UTC so CLI scripts and NestJS compute identical canonical timestamps.
 */
export function configurePostgresUtcParsers(): void {
  if (configured) return;
  configured = true;

  defaults.parseInputDatesAsUTC = true;

  types.setTypeParser(1114, (stringValue: string) => {
    if (!stringValue) return null;
    const isoStr = stringValue.includes('T')
      ? stringValue
      : stringValue.replace(' ', 'T');
    return new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z');
  });

  types.setTypeParser(1184, (stringValue: string) => {
    if (!stringValue) return null;
    return new Date(stringValue);
  });
}
