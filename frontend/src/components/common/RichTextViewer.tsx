import React from 'react';

export interface RichTextViewerProps {
  content: string;
  className?: string;
  maxLines?: number;
}

export const RichTextViewer: React.FC<RichTextViewerProps> = ({
  content,
  className = '',
}) => {
  if (!content) {
    return null;
  }

  // If content is plain text (doesn't contain html tags like <p, <div, <span, <b, <i, <h, <ul, <ol, <table), wrap in paragraphs
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  if (!hasHtml) {
    return (
      <div className={`whitespace-pre-line text-sm text-slate-700 dark:text-slate-300 ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={`tiptap-content prose prose-slate max-w-none text-sm text-slate-800 dark:prose-invert dark:text-slate-200 ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};
