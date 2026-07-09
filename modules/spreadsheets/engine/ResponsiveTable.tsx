"use client";

import type { Column } from "./types";
import { VirtualGrid } from "./VirtualGrid";
import { CardList } from "./CardList";
import { useIsDesktop } from "./useMediaQuery";

export interface ResponsiveTableProps<Row> {
  rows: Row[];
  columns: Column<Row>[];
  getRowId: (row: Row) => string;
  onCellChange: (rowIndex: number, columnId: string, value: string | number) => void;
  onRowClick?: (row: Row, rowIndex: number) => void;
  selectedRowId?: string;
  onCreateRow?: (name: string) => void;
  createPlaceholder?: string;
}

/**
 * Same Row/Column data model rendered by breakpoint: a real virtualized grid
 * on desktop, a card list on mobile. Never a shrunk grid on touch screens.
 */
export function ResponsiveTable<Row>(props: ResponsiveTableProps<Row>) {
  const isDesktop = useIsDesktop();
  return isDesktop ? <VirtualGrid {...props} /> : <CardList {...props} />;
}
