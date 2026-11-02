import type { CSSProperties } from 'react';

interface DescriptionContentProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  bulletList?: boolean;
}

/** Preserve one-paragraph descriptions while presenting generated line bullets as a list. */
export function DescriptionContent({
  text,
  className = '',
  style,
  bulletList = false,
}: DescriptionContentProps) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:[-*•]|\d+[.)])\s+/, ''));

  if (bulletList && lines.length > 1) {
    return (
      <ul
        className={`list-disc pl-5 space-y-0.5 ${className}`}
        style={{
          ...style,
          listStyleType: 'disc',
          listStylePosition: 'outside',
          paddingInlineStart: style?.paddingInlineStart || '1.25rem',
        }}
      >
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    );
  }

  return (
    <p className={`${className} whitespace-pre-line`} style={style}>
      {text}
    </p>
  );
}
