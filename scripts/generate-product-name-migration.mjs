import fs from 'node:fs/promises';
import path from 'node:path';

const inputPath = process.argv[2];
const migrationDir = process.argv[3];

if (!inputPath || !migrationDir) {
  throw new Error('Usage: node scripts/generate-product-name-migration.mjs <review_rows.json> <migration-dir>');
}

const rows = JSON.parse(await fs.readFile(inputPath, 'utf8'));

function cleanBaseName(value) {
  const withoutOldQuantity = String(value ?? '')
    .replace(/\s*\(\d+\s+pairs?\s*\(\d+\s*(?:pc|pcs|piece|pieces)\)\)\s*$/i, '')
    .replace(/\s*\((?:[^()]*(?:pc|pcs|piece|pieces|pair|pairs|set|pack)[^()]*)\)\s*$/i, '')
    .replace(/^\d+\s*pairs?\s+(?:set\s+)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = withoutOldQuantity.split(' ').filter(Boolean);
  let result = '';
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if ((candidate.length > 50 || candidate.split(' ').length > 7) && result) break;
    result = candidate;
  }
  return result || withoutOldQuantity || 'Product';
}

function quantityLabel(value) {
  if (typeof value === 'number') return value === 1 ? '1 pc' : `${value} pcs`;
  const normalized = String(value ?? '').trim().replace(/pieces?/gi, 'pcs');
  const pairMatch = normalized.match(/^(\d+)\s+pairs?\s*\((\d+)\s+pcs\)$/i);
  if (pairMatch) {
    const pairWord = pairMatch[1] === '1' ? 'pair' : 'pairs';
    return `${pairMatch[1]} ${pairWord} / ${pairMatch[2]} pcs`;
  }
  if (/^\d+(?:\s*\/\s*\d+)+$/.test(normalized)) return `${normalized.replace(/\s+/g, '')} pcs options`;
  return normalized || 'quantity varies by option';
}

function sqlLiteral(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

const updates = rows.map((row) => {
  const quantity = row['Pieces per Order'];
  const base = cleanBaseName(row['Proposed Short Name'] || row['Current Product Name']);
  const label = quantityLabel(quantity);
  const name = `${base} (${label})`;
  const details = String(row['Variant / Pack Details'] || '').trim() || `Order includes ${label}.`;
  const confidence = String(row.Confidence || 'Low');
  const basis = details;
  return {
    sku: row.SKU,
    currentName: row['Current Product Name'],
    name,
    packageContents: details,
    confidence,
    basis,
  };
});

const duplicates = updates.filter((row, index) => updates.findIndex((other) => other.sku === row.sku) !== index);
if (duplicates.length) throw new Error(`Duplicate SKUs in review input: ${duplicates.map((row) => row.sku).join(', ')}`);
if (updates.some((row) => !row.sku)) throw new Error('Every update requires a SKU.');

const values = updates
  .map((row) => `  (${[
    row.sku,
    row.name,
    row.packageContents,
    row.basis,
    row.confidence,
  ].map(sqlLiteral).join(', ')})`)
  .join(',\n');

const sql = `-- Customer-facing product-name and package-quantity normalization.
-- The original supplier title is retained in metadata.originalSupplierName so
-- the change remains reversible without altering stable product URLs/slugs.
WITH updates(sku, new_name, package_contents, quantity_basis, quantity_confidence) AS (
  VALUES
${values}
)
UPDATE "products" AS product
SET
  "name" = updates.new_name,
  "metadata" = (
    COALESCE(NULLIF(product."metadata", ''), '{}')::jsonb
    || jsonb_build_object(
      'originalSupplierName', COALESCE(
        COALESCE(NULLIF(product."metadata", ''), '{}')::jsonb ->> 'originalSupplierName',
        product."name"
      ),
      'packageContents', updates.package_contents,
      'packageQuantityBasis', updates.quantity_basis,
      'packageQuantityConfidence', updates.quantity_confidence
    )
  )::text,
  "updatedAt" = CURRENT_TIMESTAMP
FROM updates
WHERE product."sku" = updates.sku;
`;

await fs.mkdir(migrationDir, { recursive: true });
await fs.writeFile(path.join(migrationDir, 'migration.sql'), sql, 'utf8');

const summary = {
  total: updates.length,
  highConfidence: updates.filter((row) => row.confidence === 'High').length,
  mediumConfidence: updates.filter((row) => row.confidence === 'Medium').length,
  lowConfidence: updates.filter((row) => row.confidence === 'Low').length,
  setLabels: updates.filter((row) => /\(1 set\)$/i.test(row.name)).length,
  optionLabels: updates.filter((row) => /pcs options\)$/i.test(row.name)).length,
  longestName: Math.max(...updates.map((row) => row.name.length)),
};
console.log(JSON.stringify(summary, null, 2));
