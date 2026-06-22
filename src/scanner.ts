import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import ignore from 'ignore';
import type { ResolvedKanbanConfig, SourceComment } from './types.js';

const COMMENT_PATTERNS: Record<string, RegExp[]> = {
  js: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g], ts: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g], jsx: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g], tsx: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g],
  py: [/#([^\n]*)/g], go: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g], rs: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g],
  css: [/\/\*([\s\S]*?)\*\//g], scss: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g], html: [/<!--([\s\S]*?)-->/g],
  mjs: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g], cjs: [/\/\/([^\n]*)/g, /\/\*([\s\S]*?)\*\//g],
};

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string) => value.replace(/^\s*[*#/-]+\s?/gm, '').replace(/\s+/g, ' ').trim();

export function extractComments(filePath: string, source: string, tags: string[]): SourceComment[] {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const patterns = COMMENT_PATTERNS[extension] ?? [];
  const tagPattern = new RegExp(`\\b(${tags.map(escapeRegExp).join('|')})\\b(?:\\s*[:(-]?\\s*)?([\\s\\S]*)`, 'i');
  const candidates: Omit<SourceComment, 'occurrence'>[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const raw = match[1] ?? match[0];
      const normalized = normalize(raw);
      const tagged = normalized.match(tagPattern);
      if (!tagged || match.index === undefined) continue;
      const before = source.slice(0, match.index);
      const line = before.split('\n').length;
      const endLine = line + match[0].split('\n').length - 1;
      const tag = tagged[1]!.toUpperCase();
      const text = (tagged[2] ?? '').trim() || tag;
      const lines = source.split('\n');
      const context = lines.slice(Math.max(0, line - 3), Math.min(lines.length, endLine + 2)).join('\n');
      candidates.push({ filePath, line, endLine, tag, text, rawText: match[0], contentHash: hash(`${tag}:${text}`), contextHash: hash(context) });
    }
  }
  candidates.sort((a, b) => a.line - b.line);
  const occurrences = new Map<string, number>();
  return candidates.map((comment) => {
    const occurrence = occurrences.get(comment.contentHash) ?? 0;
    occurrences.set(comment.contentHash, occurrence + 1);
    return { ...comment, occurrence };
  });
}

export function parseComments(config: ResolvedKanbanConfig, filePath: string, source: string): SourceComment[] {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const parser = config.scan.parsers.find(candidate => candidate.extensions.map(value=>value.replace(/^\./,'').toLowerCase()).includes(extension));
  return parser ? parser.parse(filePath, source, Object.keys(config.scan.tags)) : extractComments(filePath, source, Object.keys(config.scan.tags));
}

export class ProjectScanner {
  private cache = new Map<string,{mtimeMs:number;size:number;comments:SourceComment[]}>();
  async scan(config:ResolvedKanbanConfig):Promise<SourceComment[]>{
    const gitignore = ignore();
    try { gitignore.add(await readFile(path.join(config.projectRoot, '.gitignore'), 'utf8')); } catch { /* optional */ }
    gitignore.add(config.scan.exclude);
    const files = await fg(config.scan.include, { cwd: config.projectRoot, onlyFiles: true, followSymbolicLinks: false, dot: true, unique: true });
    const active=new Set<string>();const comments:SourceComment[]=[];
    for (const relative of files.sort()) {
      const safeRelative = relative.replaceAll('\\', '/');
      if (gitignore.ignores(safeRelative)) continue;
      const absolute = path.resolve(config.projectRoot, relative);
      if (!isWithin(config.projectRoot, absolute)) continue;
      const info = await stat(absolute);
      if (!info.isFile() || info.size > config.scan.maxFileSize) continue;
      active.add(safeRelative);const cached=this.cache.get(safeRelative);
      if(cached&&cached.mtimeMs===info.mtimeMs&&cached.size===info.size){comments.push(...cached.comments);continue;}
      const parsed=parseComments(config,safeRelative,await readFile(absolute,'utf8'));this.cache.set(safeRelative,{mtimeMs:info.mtimeMs,size:info.size,comments:parsed});comments.push(...parsed);
    }
    for(const key of this.cache.keys())if(!active.has(key))this.cache.delete(key);
    return comments;
  }
}

export async function scanProject(config: ResolvedKanbanConfig): Promise<SourceComment[]> { return new ProjectScanner().scan(config); }

export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
