import React, { useMemo, useState } from 'react';
import { Column, Table, Pagination } from './Table';
import { cn } from '../utils';

/**
 * Sortable, paginated data table composing the primitive `Table` and
 * `Pagination` primitives. Sort state is owned internally (local server pages
 * sort client-side; for server-side sorting pass `onSort` to lift state up and
 * keep a page of pre-sorted data).
 *
 * A column sorts on the value `sortValue` returns. When omitted, the column is
 * not sortable (the `render` cell is display-only and cannot be compared).
 */
export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  /** Return the comparable primitive a column sorts on. */
  sortValue?: (row: T, column: Column<T>) => string | number | null | undefined;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  loading?: boolean;
  emptyMessage?: string;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
  /** Initial sort column + direction. */
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  /** External sort control for server-fetched pages. */
  sort?: { key: string; direction: 'asc' | 'desc' };
  onSort?: (sort: { key: string; direction: 'asc' | 'desc' } | null) => void;
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    pageSizeOptions?: number[];
    showPageSizeSelector?: boolean;
  };
  className?: string;
}

function getSortableKeys<T>(columns: Column<T>[], sortValue?: (r: T, c: Column<T>) => unknown): Set<string> {
  const keys = new Set<string>();
  for (const column of columns) {
    if (column.sortable && sortValue) keys.add(column.key);
  }
  return keys;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  sortValue,
  onRowClick,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  loading = false,
  emptyMessage = 'No data available',
  striped = false,
  hoverable = true,
  compact = false,
  defaultSort,
  sort: externalSort,
  onSort,
  pagination,
  className,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    defaultSort ?? null
  );

  const sort = onSort ? externalSort ?? null : internalSort;
  const sortableKeys = useMemo(
    () => getSortableKeys(columns, sortValue),
    [columns, sortValue]
  );

  // If no sortable column exists (no sortValue resolver), computeSort is a no-op.
  const sortedData = useMemo(() => {
    if (!sort || !sortValue) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;

    const next = [...data];
    const dir = sort.direction === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      const av = sortValue(a, col);
      const bv = sortValue(b, col);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return next;
  }, [data, sort, columns, sortValue]);

  const handleSort = (key: string) => {
    if (!sortableKeys.has(key)) return;
    const next =
      sort && sort.key === key
        ? sort.direction === 'asc'
          ? { key, direction: 'desc' as const }
          : null
        : { key, direction: 'asc' as const };
    if (onSort) onSort(next);
    else setInternalSort(next);
  };

  const headerColumns = columns.map((column) => {
    if (!column.sortable || !sortableKeys.has(column.key)) return column;
    const active = sort?.key === column.key;
    const direction = active ? sort.direction : null;
    return {
      ...column,
      header: (
        <button
          type="button"
          onClick={() => handleSort(column.key)}
          className="inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] rounded"
          aria-label={`Sort by ${column.header}${active ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
          aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
        >
          {column.header}
          <span className={cn('text-[var(--color-text-tertiary)]', active && 'text-[var(--color-interactive-primary)]')} aria-hidden="true">
            {active ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </button>
      ),
    };
  });

  return (
    <div className={cn('w-full', className)}>
      <Table
        columns={headerColumns}
        data={sortedData}
        keyExtractor={keyExtractor}
        onRowClick={onRowClick}
        selectable={selectable}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
        loading={loading}
        emptyMessage={emptyMessage}
        striped={striped}
        hoverable={hoverable}
        compact={compact}
      />
      {pagination && (
        <Pagination
          currentPage={pagination.page}
          totalPages={Math.max(1, Math.ceil(pagination.totalItems / pagination.pageSize))}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          pageSizeOptions={pagination.pageSizeOptions}
          showPageSizeSelector={pagination.showPageSizeSelector}
        />
      )}
    </div>
  );
}