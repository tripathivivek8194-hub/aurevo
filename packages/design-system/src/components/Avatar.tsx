import React, { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'square';
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      alt,
      fallback,
      size = 'md',
      shape = 'circle',
      className,
      ...props
    },
    ref
  ) => {
    const sizeStyles = {
      xs: 'w-6 h-6 text-xs',
      sm: 'w-8 h-8 text-sm',
      md: 'w-10 h-10 text-base',
      lg: 'w-12 h-12 text-lg',
      xl: 'w-16 h-16 text-xl',
      '2xl': 'w-24 h-24 text-2xl',
    };

    const shapeStyles = {
      circle: 'rounded-full',
      square: 'rounded-lg',
    };

    const getInitials = (name: string): string => {
      return name
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    };

    const [imageError, setImageError] = React.useState(false);

    if (src && !imageError) {
      return (
        <div
          ref={ref}
          className={cn(
            'inline-flex items-center justify-center overflow-hidden bg-[var(--color-background-tertiary)]',
            'flex-shrink-0',
            sizeStyles[size],
            shapeStyles[shape],
            className
          )}
          {...props}
        >
          <img
            src={src}
            alt={alt || ''}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center bg-[var(--color-interactive-secondary)] text-[var(--color-text-primary)]',
          'font-medium flex-shrink-0',
          sizeStyles[size],
          shapeStyles[shape],
          className
        )}
        {...props}
        aria-label={alt || fallback}
      >
        {fallback || (alt ? getInitials(alt) : '?')}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  max?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ children, max = 5, size = 'md', className, ...props }, ref) => {
    const childArray = React.Children.toArray(children);
    const visibleChildren = childArray.slice(0, max);
    const remainingCount = childArray.length - max;

    const overlapStyles = {
      xs: '-space-x-1',
      sm: '-space-x-1.5',
      md: '-space-x-2',
      lg: '-space-x-2.5',
      xl: '-space-x-3',
      '2xl': '-space-x-4',
    };

    const sizeStyles = {
      xs: 'w-6 h-6 text-xs',
      sm: 'w-8 h-8 text-sm',
      md: 'w-10 h-10 text-base',
      lg: 'w-12 h-12 text-lg',
      xl: 'w-16 h-16 text-xl',
      '2xl': 'w-24 h-24 text-2xl',
    };

    return (
      <div
        ref={ref}
        className={cn('flex', overlapStyles[size], className)}
        {...props}
      >
        {visibleChildren.map((child, index) => {
          const childElement = child as React.ReactElement;
          return React.cloneElement(childElement, {
            key: childElement.key || index,
            size,
            className: cn(
              'border-2 border-[var(--color-background-primary)]',
              index === 0 && 'z-10',
              childElement.props?.className || ''
            ),
          });
        })}
        {remainingCount > 0 && (
          <div
            className={cn(
              'inline-flex items-center justify-center bg-[var(--color-background-tertiary)] text-[var(--color-text-secondary)]',
              'font-medium border-2 border-[var(--color-background-primary)] flex-shrink-0',
              sizeStyles[size],
              'rounded-full'
            )}
            aria-label={`${remainingCount} more`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
    );
  }
);

AvatarGroup.displayName = 'AvatarGroup';