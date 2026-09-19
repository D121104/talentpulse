import { useEffect, useRef, useState, type ReactNode } from "react";

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
  onComplete?: () => void;
  onUpdate?: () => void;
  renderContent: (text: string) => ReactNode;
}

export default function StreamingText({
  content,
  isStreaming,
  onComplete,
  onUpdate,
  renderContent,
}: StreamingTextProps) {
  const [displayedLength, setDisplayedLength] = useState(
    isStreaming ? 0 : content.length,
  );
  const [isFinished, setIsFinished] = useState(!isStreaming);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedLength(content.length);
      setIsFinished(true);
      return;
    }

    setDisplayedLength(0);
    setIsFinished(false);

    let currentIndex = 0;
    const totalLength = content.length;

    const streamNextChunk = () => {
      if (currentIndex >= totalLength) {
        setIsFinished(true);
        onComplete?.();
        return;
      }

      // Variable chunk size for natural token streaming (2-4 characters per step)
      const step = Math.min(
        Math.floor(Math.random() * 3) + 2,
        totalLength - currentIndex,
      );
      currentIndex += step;
      setDisplayedLength(currentIndex);
      onUpdate?.();

      // Slightly pause on sentence boundaries for natural cadence
      const char = content[currentIndex - 1];
      const isPause = char === "." || char === "\n" || char === "!" || char === "?";
      const delay = isPause ? 40 : 16;

      timeoutRef.current = window.setTimeout(streamNextChunk, delay);
    };

    timeoutRef.current = window.setTimeout(streamNextChunk, 20);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [content, isStreaming, onComplete, onUpdate]);

  const handleSkip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDisplayedLength(content.length);
    setIsFinished(true);
    onComplete?.();
    onUpdate?.();
  };

  const visibleText = content.slice(0, displayedLength);

  return (
    <div
      onClick={!isFinished ? handleSkip : undefined}
      className={!isFinished ? "cursor-pointer group" : ""}
      title={!isFinished ? "Bấm để hiển thị toàn bộ ngay" : undefined}
    >
      {renderContent(visibleText)}
      {!isFinished && (
        <span className="inline-flex items-center gap-1.5 pt-1 text-xs text-slate-400">
          <span className="inline-block h-3.5 w-1.5 animate-pulse rounded-xs bg-primary align-middle" />
          <span className="text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
            (Bấm để hiện nhanh)
          </span>
        </span>
      )}
    </div>
  );
}
