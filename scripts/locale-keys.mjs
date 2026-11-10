// Copyright The RACE Authors
// SPDX-License-Identifier: Apache-2.0

// Adding a language, the part that is typing: `export` writes the work file of a language (git-ignored, in
// `locale-work/`), and `import` turns the filled-in file into `packages/mcp/src/locales/<code>.json`. A text not marked
// as reviewed by a person is listed in `<code>.unreviewed.json` beside it, and the tests fail while that file exists.
// Translating itself is done outside the repository, by whatever the contributor trusts; nothing here calls out.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkFile, readWorkFile } from './lib/locale-keys.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'packages', 'mcp', 'src', 'locales');
const workDir = join(root, 'locale-work');
const [command, code] = process.argv.slice(2);

if ((command !== 'export' && command !== 'import') || !/^[a-z]{2,3}$/.test(code ?? '')) {
  console.error('Usage: npm run locale:keys -- <export|import> <code>   (the code is such as de or fr)');
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const english = readJson(join(localesDir, 'en.json'));
const ownFile = join(localesDir, `${code}.json`);
const workFile = join(workDir, `${code}.keys.json`);
const unreviewedFile = join(localesDir, `${code}.unreviewed.json`);

if (command === 'export') {
  mkdirSync(workDir, { recursive: true });
  writeJson(workFile, buildWorkFile(code, english, existsSync(ownFile) ? readJson(ownFile) : undefined));
  console.log(`Wrote ${workFile}. Fill it in, then: npm run locale:keys -- import ${code}`);
} else {
  const { locale, unreviewed, problems } = readWorkFile(readJson(workFile), english);
  if (problems.length > 0) {
    console.error(`${String(problems.length)} problem(s), nothing written:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  writeJson(ownFile, locale);
  if (unreviewed.length > 0) writeJson(unreviewedFile, unreviewed);
  else rmSync(unreviewedFile, { force: true });
  console.log(`Wrote ${ownFile}.`);
  if (unreviewed.length > 0) {
    console.log(
      `${String(unreviewed.length)} text(s) are not reviewed: they are listed in ${unreviewedFile}, and the tests ` +
        'fail until a person who reads the language has checked them and the file is deleted.',
    );
  }
  console.log(
    'Then add the code to LOCALES and import the file in locales/index.ts (see docs/public/LOCALES.md).',
  );
}
