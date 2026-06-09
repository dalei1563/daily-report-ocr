export type Role = 'admin' | 'user';

export interface User {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  bound_template_id?: number;
}

export interface TemplateField {
  id?: number;
  code: string;
  name: string;
  field_type: 'text' | 'number' | 'date';
  area: 'header' | 'table';
  required: boolean;
  aliases: string[];
  sort_order: number;
}

export interface Template {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
  fields: TemplateField[];
}

export interface RecordList {
  id: number;
  original_filename: string;
  status: string;
  error_message: string;
  duration_ms?: number;
  created_at: string;
  updated_at: string;
  confirmed_at?: string;
  template_name: string;
  username: string;
}

export interface StructuredResult {
  header: Record<string, unknown>;
  rows: Record<string, unknown>[];
  warnings: string[];
}

export interface RecordDetail extends RecordList {
  template: Template;
  file_url: string;
  result: StructuredResult | null;
  raw_markdown: string;
  warnings: string[];
}
