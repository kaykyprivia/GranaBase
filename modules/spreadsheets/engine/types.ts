export type ColumnType = "text" | "number" | "currency" | "percentage" | "select";

export interface Column<Row> {
  id: string;
  label: string;
  type: ColumnType;
  editable?: boolean;
  width?: number;
  options?: { value: string; label: string }[];
  getValue: (row: Row) => string | number | null;
  setValue?: (row: Row, value: string | number) => Row;
}

export interface TableConfig<Row> {
  columns: Column<Row>[];
  getRowId: (row: Row) => string;
}

export interface CellPosition {
  rowIndex: number;
  columnId: string;
}
