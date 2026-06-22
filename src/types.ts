import type { IncomingMessage } from 'node:http';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Actor = { id: string; name?: string };
export type CardStatus = 'open' | 'resolved' | 'archived' | 'changed' | 'orphaned';

export interface ColumnConfig { id: string; name: string; completion?: boolean; colorToken?: string }
export interface TagConfig { column: string; priority?: 'low' | 'normal' | 'high'; label?: string }
export interface ThemeTokens { canvas: string; canvasSoft: string; surface: string; ink: string; inkMuted: string; hairline: string; primary: string; primaryActive: string }
export interface AuthConfig<T = any> {
  enabled?: boolean;
  guard?: (request: T) => boolean | Promise<boolean>;
  actor?: (request: T) => Actor | undefined | Promise<Actor | undefined>;
}
export interface StorageConfig {
  adapter?: 'sqlite' | 'postgres' | 'mysql';
  connectionString?: string;
  filename?: string;
}
export interface ScanConfig {
  include?: string[];
  exclude?: string[];
  tags?: Record<string, TagConfig>;
  watch?: boolean;
  intervalMs?: number;
  maxFileSize?: number;
  parsers?: CommentParser[];
}
export interface CommentParser { extensions: string[]; parse(filePath: string, source: string, tags: string[]): SourceComment[] }
export interface KanbanConfig<TRequest = any> {
  projectRoot?: string;
  mountPath?: string;
  boardName?: string;
  columns?: Array<string | ColumnConfig>;
  scan?: ScanConfig;
  storage?: StorageConfig;
  theme?: { default?: ThemeMode; overrides?: Partial<ThemeTokens> };
  auth?: AuthConfig<TRequest>;
}
export interface SourceComment {
  filePath: string; line: number; endLine: number; tag: string; text: string;
  rawText: string; contentHash: string; contextHash: string; occurrence: number;
}
export interface Card {
  id: string; columnId: string; position: number; tag: string; title: string; body: string;
  notes: string; assignee?: string; labels: string[]; priority: string; sourceFilePath: string;
  sourceLine: number; sourceContentHash: string; sourceContextHash: string; sourceOccurrence: number;
  status: CardStatus; createdAt: string; updatedAt: string;
}
export interface BoardState { id: string; name: string; columns: Array<ColumnConfig & { position: number }>; cards: Card[]; settings: Record<string, unknown> }
export type NodeRequest = IncomingMessage;

export interface StorageAdapter {
  migrate(): Promise<void>;
  initialize(config: ResolvedKanbanConfig): Promise<void>;
  getBoard(): Promise<BoardState>;
  reconcile(comments: SourceComment[]): Promise<{ created: number; updated: number; archived: number }>;
  moveCard(id: string, columnId: string, position: number, actor?: Actor): Promise<void>;
  updateCard(id: string, patch: { notes?: string; assignee?: string | null; labels?: string[] }, actor?: Actor): Promise<void>;
  getActivity(cardId: string): Promise<unknown[]>;
  updateSettings(patch: Record<string, unknown>): Promise<void>;
  replaceColumns(columns: ColumnConfig[], destinationColumnId?: string): Promise<void>;
  close(): Promise<void>;
}
export interface ResolvedKanbanConfig extends Required<Omit<KanbanConfig, 'auth' | 'theme' | 'storage' | 'scan' | 'columns'>> {
  columns: ColumnConfig[]; scan: Required<Omit<ScanConfig, 'parsers'>> & { parsers: CommentParser[] }; storage: Required<StorageConfig>;
  theme: { default: ThemeMode; overrides: Partial<ThemeTokens> }; auth: AuthConfig;
}
