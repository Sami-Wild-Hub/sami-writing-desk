// Imported foreshadow table: author cells and separately editable recovery chapter links.
export interface ForeshadowRow {
  sheet: string;
  source_row: number;
  author: Record<string, string>;
  derived: {
    recovery_chapters: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export interface ForeshadowData {
  schema_version: 1;
  columns: { header: string; source_column: string }[];
  sheets: { name: string; data_rows: number; [key: string]: unknown }[];
  rows: ForeshadowRow[];
  [key: string]: unknown;
}
