#!/usr/bin/env node
/**
 * Scaffolds a new Angular EDS block under angular-app/app/<name>/.
 * Usage: npm run angular:new-block -- <component-name>
 * Example: npm run angular:new-block -- my-widget
 */
/* eslint-disable no-console -- CLI progress and errors */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');

/** @param {string} input */
function toKebabCase(input) {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** @param {string} kebab */
function toPascalCase(kebab) {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const rawName = process.argv[2];
if (!rawName) {
  console.error('Usage: npm run angular:new-block -- <component-name>');
  console.error('Example: npm run angular:new-block -- my-widget');
  process.exit(1);
}

const kebab = toKebabCase(rawName);
if (!kebab || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(kebab)) {
  console.error(`Invalid component name: ${rawName}`);
  process.exit(1);
}

const className = `${toPascalCase(kebab)}Component`;
const appDir = path.join(root, 'angular-app/app', kebab);

if (fs.existsSync(appDir)) {
  console.error(`Already exists: ${appDir}`);
  process.exit(1);
}

const selector = `${kebab}-root`;
const hostClass = `${kebab}-host`;

const indexTs = `import 'zone.js';
/* Side effect: extracted to blocks/${kebab}/${kebab}.css (aem loadCSS). */
import './${kebab}.component.scss';
import { decorateWithStandaloneComponent } from '../../shared/decorate-with-standalone-component';
import { ${className} } from './${kebab}.component';

/**
 * Standard EDS block contract: default export decorate(block).
 * aem.js loadBlock imports this module and calls await mod.default(block).
 */
export default async function decorate(block: HTMLElement) {
  await decorateWithStandaloneComponent(block, undefined, {
    component: ${className},
    hostClassName: '${hostClass}',
  });
}
`;

const componentTs = `import { Component, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { EDS_BLOCK_HTML } from '../../shared/block-tokens';

@Component({
  selector: '${selector}',
  standalone: true,
  templateUrl: './${kebab}.component.html',
  styleUrl: './${kebab}.component.scss',
})
export class ${className} {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authoredHtml = inject(EDS_BLOCK_HTML, { optional: true });
}
`;

const componentHtml = `<!-- ${kebab} -->
`;

const componentScss = `/* ${kebab} */
`;

fs.mkdirSync(appDir, { recursive: true });
fs.writeFileSync(path.join(appDir, 'index.ts'), indexTs, 'utf8');
fs.writeFileSync(path.join(appDir, `${kebab}.component.ts`), componentTs, 'utf8');
fs.writeFileSync(path.join(appDir, `${kebab}.component.html`), componentHtml, 'utf8');
fs.writeFileSync(path.join(appDir, `${kebab}.component.scss`), componentScss, 'utf8');

console.log(`Created angular-app/app/${kebab}/`);
console.log('Run npm run angular:build or npm run angular:watch to emit blocks/ bundles.');
