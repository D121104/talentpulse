interface JobHtmlDescriptionProps {
  content?: string;
  fallback?: string;
  className?: string;
}

export default function JobHtmlDescription({
  content,
  fallback = 'Chi tiết công việc sẽ được trao đổi cụ thể trong quá trình phỏng vấn.',
  className = '',
}: JobHtmlDescriptionProps) {
  if (!content || !content.trim()) {
    return <p className="text-slate-400 italic text-xs sm:text-sm">{fallback}</p>;
  }

  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  if (hasHtml) {
    return (
      <div
        className={`job-html-content text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed space-y-2
          [&_h1]:text-base sm:[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-900 dark:[&_h1]:text-white [&_h1]:mt-3 [&_h1]:mb-1.5
          [&_h2]:text-sm sm:[&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-1.5
          [&_h3]:text-sm sm:[&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-900 dark:[&_h3]:text-white [&_h3]:mt-3 [&_h3]:mb-1.5
          [&_p]:my-1.5 [&_p]:leading-relaxed
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1
          [&_li]:my-0.5 [&_li]:leading-relaxed
          [&_strong]:font-bold [&_strong]:text-slate-900 dark:[&_strong]:text-white
          [&_b]:font-bold [&_b]:text-slate-900 dark:[&_b]:text-white
          [&_a]:text-primary [&_a]:underline
          ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <div
      className={`whitespace-pre-line text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${className}`}
    >
      {content}
    </div>
  );
}
