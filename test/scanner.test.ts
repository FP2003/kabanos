import { describe, expect, it } from 'vitest';
import { extractComments, isWithin } from '../src/scanner.js';

describe('comment extraction', () => {
  it('extracts supported comments and distinguishes duplicates', () => {
    const comments = extractComments('src/a.ts', '// TODO: ship it\nconst x = 1; // FIXME bad\n// TODO: ship it', ['TODO', 'FIXME']);
    expect(comments.map(comment => [comment.tag, comment.text, comment.occurrence])).toEqual([
      ['TODO', 'ship it', 0], ['FIXME', 'bad', 0], ['TODO', 'ship it', 1],
    ]);
  });

  it('supports Python, Rust, CSS, and HTML syntax', () => {
    expect(extractComments('a.py', '# TODO python', ['TODO'])).toHaveLength(1);
    expect(extractComments('a.rs', '/* FIXME rust */', ['FIXME'])).toHaveLength(1);
    expect(extractComments('a.css', '/* TODO css */', ['TODO'])).toHaveLength(1);
    expect(extractComments('a.html', '<!-- TODO html -->', ['TODO'])).toHaveLength(1);
  });
});

describe('project containment', () => {
  it('rejects parent traversal', () => {
    expect(isWithin('/project', '/project/src/a.ts')).toBe(true);
    expect(isWithin('/project', '/other/a.ts')).toBe(false);
  });
});
