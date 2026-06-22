import { rm } from 'node:fs/promises';

await rm(new URL('./project/.kanban', import.meta.url), { recursive: true, force: true });
console.log('Kabanos demo state cleared.');
