import React, { HTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '../utils';
import { Checkbox } from './Checkbox';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> extends HTMLAttributes<HTMLTableElement> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  loading?: boolean;
  emptyMessage?: string;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  loading = false,
  emptyMessage = 'No data available',
  striped = false,
  hoverable = true,
  compact = false,
  className,
  ...props
}: TableProps<T>) {
  const isSelected = (key: string) => selectedKeys.includes(key);
  const allSelected = data.length > 0 && data.every(row => isSelected(keyExtractor(row)));
  const someSelected = data.length > 0 && data.some(row => isSelected(keyExtractor(row)));

  const handleHeaderSelectChange = (checked: boolean) => {
    if (checked) {
      onSelectionChange?.(data.map(keyExtractor));
    } else {
      onSelectionChange?.([]);
    }
  };

  const handleRowSelectChange = (key: string, checked: boolean) => {
    if (checked) {
      onSelectionChange?.([...selectedKeys, key]);
    } else {
      onSelectionChange?.(selectedKeys.filter(k => k !== key));
    }
  };

  const getAlignClass = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className={cn('w-full', className)} {...props}>
          <thead>
            <tr>
              {selectable && <th className="px-4 py-3 w-12" />}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider bg-[var(--color-background-secondary)]',
                    column.headerClassName,
                    getAlignClass(column.align)
                  )}
                  style={{ width: column.width }}
                >
                  <Skeleton variant="text" height={16} width={72} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className={cn('border-t border-[var(--color-border-primary)]', striped && i % 2 === 0 && 'bg-[var(--color-background-secondary)]')}>
                {selectable && <td className="px-4 py-3" />}
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3', getAlignClass(column.align))}>
                    <Skeleton variant="text" height={16} width={100} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className={cn('w-full', className)} {...props}>
          <thead>
            <tr>
              {selectable && <th className="px-4 py-3 w-12" />}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider bg-[var(--color-background-secondary)]',
                    column.headerClassName,
                    getAlignClass(column.align)
                  )}
                  style={{ width: column.width }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-[var(--color-text-tertiary)]">
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full', className)} {...props}>
        <thead>
          <tr>
            {selectable && (
              <th className="px-4 py-3 w-12">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onChange={handleHeaderSelectChange}
                  aria-label="Select all rows"
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider bg-[var(--color-background-secondary)]',
                  column.headerClassName,
                  getAlignClass(column.align)
                )}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const key = keyExtractor(row);
            const isRowSelected = isSelected(key);

            return (
              <tr
                key={key}
                className={cn(
                  'border-t border-[var(--color-border-primary)] transition-colors',
                  striped && rowIndex % 2 === 0 && 'bg-[var(--color-background-secondary)]',
                  hoverable && 'hover:bg-[var(--color-background-tertiary)]',
                  onRowClick && 'cursor-pointer',
                  isRowSelected && 'bg-[var(--color-interactive-primary)]/5'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {selectable && (
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={isRowSelected}
                      onChange={(checked) => handleRowSelectChange(key, checked)}
                      aria-label={`Select row ${rowIndex + 1}`}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 text-sm',
                      column.className,
                      getAlignClass(column.align)
                    )}
                  >
                    {column.render ? column.render(row, rowIndex) : (row as any)[column.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  showPageSizeSelector?: boolean;
  pageSizeOptions?: number[];
  className?: string;
}

export const Pagination = forwardRef<HTMLDivElement, PaginationProps>(
  ({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
    showPageSizeSelector = true,
    pageSizeOptions = [10, 20, 50, 100],
    className,
  }, ref) => {
    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    const pages = getPageNumbers(currentPage, totalPages);

    return (
      <div
        ref={ref}
        className={cn('flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-[var(--color-border-primary)]', className)}
      >
        <div className="text-sm text-[var(--color-text-secondary)]">
          Showing <span className="font-medium">{startItem}</span> to{' '}
          <span className="font-medium">{endItem}</span> of{' '}
          <span className="font-medium">{totalItems}</span> results
        </div>
        <div className="flex items-center gap-2">
          {showPageSizeSelector && onPageSizeChange && (
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-3 py-1.5 text-sm border border-[var(--color-border-primary)] rounded-lg bg-[var(--color-background-primary)] text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
              aria-label="Items per page"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          )}
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {pages.map((page, index) => (
              <button
                key={index}
                type="button"
                onClick={() => typeof page === 'number' && onPageChange(page)}
                disabled={page === '...'}
                className={cn(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
                  page === currentPage
                    ? 'bg-[var(--color-interactive-primary)] text-[var(--color-text-inverse)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)]',
                  page === '...' && 'cursor-default'
                )}
                aria-label={page === '...' ? 'More pages' : `Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    );
  }
);

Pagination.displayName = 'Pagination';

function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];
  const delta = 2;

  if (currentPage <= delta + 1) {
    for (let i = 1; i <= delta + 2; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  } else if (currentPage >= totalPages - delta) {
    pages.push(1);
    pages.push('...');
    for (let i = totalPages - delta - 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    for (let i = currentPage - delta; i <= currentPage + delta; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  }

  return pages;
}