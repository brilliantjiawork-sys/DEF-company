import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationMarker = path.join(root, 'data', '.content-index-migrated-v1');
const definitions = [
  { legacy: 'data/database.json', folder: 'data/stories', key: 'articles' },
  { legacy: 'data/event-coverage.json', folder: 'data/trade-show-articles', key: 'articles' },
];

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function slugify(value) {
  return String(value || 'article')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'article';
}
function dateOf(record) {
  return String(record.date || record.published_date || '').slice(0, 10);
}
function identity(record) {
  return `${String(record.title || '').trim().toLowerCase()}|${dateOf(record)}`;
}
function isPublished(record) {
  const status = String(record.status || record.publication_status || 'published').trim().toLowerCase();
  return !['draft', 'unpublished'].includes(status);
}
function readFolderRecords(folder) {
  const full = path.join(root, folder);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .sort()
    .map(name => ({ file: name, record: readJson(path.join(full, name), null) }))
    .filter(item => item.record && typeof item.record === 'object' && !Array.isArray(item.record));
}
function writeJsonIfChanged(file, value) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === output) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, output);
  return true;
}

for (const definition of definitions) {
  const legacyPath = path.join(root, definition.legacy);
  const folderPath = path.join(root, definition.folder);
  fs.mkdirSync(folderPath, { recursive: true });

  // One-time, non-destructive migration: preserve existing array-based articles as individual JSON files.
  if (!fs.existsSync(migrationMarker)) {
    const legacyData = readJson(legacyPath, { [definition.key]: [] });
    const legacyRecords = Array.isArray(legacyData[definition.key]) ? legacyData[definition.key] : [];
    const currentRecords = readFolderRecords(definition.folder).map(item => item.record);
    const known = new Set(currentRecords.map(identity));
    for (const record of legacyRecords) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
      const key = identity(record);
      if (known.has(key)) continue;
      const titleSlug = slugify(record.slug || record.title);
      const dateSuffix = dateOf(record).replace(/-/g, '');
      const base = [titleSlug, dateSuffix].filter(Boolean).join('-');
      let filename = `${base || titleSlug}.json`;
      let counter = 2;
      while (fs.existsSync(path.join(folderPath, filename))) filename = `${base || titleSlug}-${counter++}.json`;
      const migrated = { ...record };
      if (!migrated.slug) migrated.slug = titleSlug;
      writeJsonIfChanged(path.join(folderPath, filename), migrated);
      known.add(key);
    }
  }

  const records = readFolderRecords(definition.folder)
    .map(item => ({ ...item.record, slug: item.record.slug || item.file.replace(/\.json$/i, '') }))
    .filter(isPublished)
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || String(a.title || '').localeCompare(String(b.title || '')));
  writeJsonIfChanged(legacyPath, { [definition.key]: records });
}

if (!fs.existsSync(migrationMarker)) {
  fs.writeFileSync(migrationMarker, 'Legacy article arrays migrated to per-article JSON files. Do not remove.\n');
}
console.log('Content indexes synchronized from per-article JSON files.');
