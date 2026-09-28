import React, { ReactNode, useState, useRef, useEffect, forwardRef } from 'react';
import { cn } from '../utils';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<HTMLElement>(null);

  const showTooltip = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Clone child to attach ref and event handlers
  const childWithProps = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement, {
        ref: childRef,
        onMouseEnter: showTooltip,
        onMouseLeave: hideTooltip,
        onFocus: showTooltip,
        onBlur: hideTooltip,
      })
    : (
        <span ref={childRef} onMouseEnter={showTooltip} onMouseLeave={hideTooltip} onFocus={showTooltip} onBlur={hideTooltip}>
          {children}
        </span>
      );

  const positionStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowStyles = {
    top: 'bottom-[-4px] left-1/2 -translate-x-1/2 border-t-[var(--color-text-primary)] border-transparent',
    bottom: 'top-[-4px] left-1/2 -translate-x-1/2 border-b-[var(--color-text-primary)] border-transparent',
    left: 'right-[-4px] top-1/2 -translate-y-1/2 border-l-[var(--color-text-primary)] border-transparent',
    right: 'left-[-4px] top-1/2 -translate-y-1/2 border-r-[var(--color-text-primary)] border-transparent',
  };

  if (!isVisible) return <>{childWithProps}</>;

  return (
    <>
      {childWithProps}
      <div
        ref={tooltipRef}
        className={cn(
          'absolute z-50 px-3 py-2 text-xs font-medium text-[var(--color-text-inverse)]',
          'bg-[var(--color-text-primary)] rounded-lg shadow-lg whitespace-nowrap',
          'animate-fade-in',
          positionStyles[position]
        )}
        role="tooltip"
      >
        {content}
        <div
          className={cn(
            'absolute w-0 h-0 border-4',
            arrowStyles[position]
          )}
        />
      </div>
    </>
  );
}