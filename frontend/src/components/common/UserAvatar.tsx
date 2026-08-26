import { useState, useEffect } from 'react';

export interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  shape?: 'circle' | 'rounded';
  className?: string;
}

export function UserAvatar({
  src,
  alt = 'User avatar',
  size = 'md',
  shape = 'circle',
  className = '',
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Reset error state if src changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10 sm:h-11 sm:w-11',
    lg: 'h-14 w-14',
    xl: 'h-16 w-16',
    custom: '',
  };

  const shapeClasses = {
    circle: 'rounded-full',
    rounded: 'rounded-2xl',
  };

  const isValidUrl = (url?: string | null): boolean => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.length < 5) return false;
    return (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('/')
    );
  };

  const shouldRenderImage = isValidUrl(src) && !imageError;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-slate-200 dark:bg-slate-700 select-none shrink-0 ${shapeClasses[shape]} ${sizeClasses[size]} ${className}`}
    >
      {shouldRenderImage ? (
        <img
          src={src!}
          alt={alt}
          onError={() => setImageError(true)}
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        /* Anonymous silhouette avatar matching standard design */
        <svg
          className="h-[85%] w-[85%] text-slate-400 dark:text-slate-300 translate-y-1"
          viewBox="0 0 36 36"
          fill="currentColor"
          aria-hidden="true"
        >
          {/* Head */}
          <circle cx="18" cy="12" r="6.5" />
          {/* Shoulders */}
          <path d="M5 33c0-7.18 5.82-13 13-13s13 5.82 13 13H5z" />
        </svg>
      )}
    </div>
  );
}
