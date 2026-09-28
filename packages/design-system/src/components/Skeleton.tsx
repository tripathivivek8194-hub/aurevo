import React, { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  lines?: number;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      variant = 'rectangular',
      width,
      height,
      circle = false,
      lines,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'animate-pulse bg-[var(--color-background-tertiary)]';

    const variantStyles = {
      text: circle ? 'rounded-full' : 'rounded-md',
      circular: 'rounded-full',
      rectangular: 'rounded-lg',
    };

    const getSizeStyle = (): React.CSSProperties => {
      const computedStyle: React.CSSProperties = { ...style };
      if (width !== undefined) computedStyle.width = typeof width === 'number' ? `${width}px` : width;
      if (height !== undefined) computedStyle.height = typeof height === 'number' ? `${height}px` : height;
      return computedStyle;
    };

    // Render multiple lines if requested
    if (lines && lines > 0) {
      return (
        <div
          ref={ref}
          className={cn('space-y-3', className)}
          {...props}
        >
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className={cn(baseStyles, variantStyles.text)}
              style={{
                width: i === lines - 1 ? '60%' : '100%',
                height: (typeof height === 'number' ? height : 16),
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], circle && 'rounded-full', className)}
        style={getSizeStyle()}
        aria-hidden="true"
        {...props}
      />
    );
  }
);

Skeleton.displayName = 'Skeleton';