#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SOURCE_HTML = path.join(ROOT, 'index.html');

const CANONICAL_URL = process.env.CANONICAL_URL || 'https://webnarmateus.vercel.app/';
const SITE_NAME = 'LEX';
const PAGE_TITLE = 'Aula Gratuita | Mateus Ribeiro | LEX';
const META_DESCRIPTION =
  'Aula gratuita e ao vivo em terça-feira, 14/07 às 20h. Empresários e líderes: pare de crescer no improviso e comece a se posicionar com autoridade. Com Mateus Ribeiro.';
const OG_IMAGE = `${CANONICAL_URL.replace(/\/$/, '')}/assets/hero.webp`;

const FORBIDDEN_BRAND_PATTERNS = [
  /personal\s*trainer\s*academy/i,
  /personaltraineracademy/i,
  /pos\.personaltraineracademy\.com/i,
];

function log(step, message) {
  console.log(`[build] ${step}: ${message}`);
}

function assertNoForbiddenBrands(label, content) {
  for (const pattern of FORBIDDEN_BRAND_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(`Referência proibida (${pattern}) encontrada em ${label}.`);
    }
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rimraf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readSourceHtml() {
  return fs.readFileSync(SOURCE_HTML, 'utf8');
}

function extractBetween(source, startTag, endTag) {
  const start = source.indexOf(startTag);
  const end = source.indexOf(endTag, start);
  if (start === -1 || end === -1) {
    throw new Error(`Não foi possível extrair bloco ${startTag}`);
  }
  return source.slice(start + startTag.length, end).trim();
}

function protectThirdPartyScripts(html) {
  const placeholders = [];
  const patterns = [
    /<script async src="https:\/\/www\.dashmonster\.com\.br\/api\/tracking\/pixel\.js\?via=proxy"><\/script>/g,
    /<script>window\.dmq=window\.dmq\|\|\[\];dmq\.push\(\[[\s\S]*?\]\);<\/script>/g,
  ];

  patterns.forEach((pattern) => {
    html = html.replace(pattern, (match) => {
      const token = `<!--__THIRD_PARTY_SCRIPT_${placeholders.length}__-->`;
      placeholders.push(match);
      return token;
    });
  });

  return { html, placeholders };
}

function restoreThirdPartyScripts(html, placeholders) {
  placeholders.forEach((block, index) => {
    html = html.replace(`<!--__THIRD_PARTY_SCRIPT_${index}__-->`, block);
  });
  return html;
}

function injectSeoAndPerformance(html) {
  const seoBlock = `
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${CANONICAL_URL}">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:url" content="${CANONICAL_URL}">
    <meta property="og:image" content="${OG_IMAGE}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${PAGE_TITLE}">
    <meta name="twitter:description" content="${META_DESCRIPTION}">
    <meta name="twitter:image" content="${OG_IMAGE}">
    <link rel="preconnect" href="https://www.dashmonster.com.br" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://unpkg.com" crossorigin>
    <link rel="dns-prefetch" href="https://hook.us2.make.com">
    <link rel="dns-prefetch" href="https://sndflw.com">`;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${PAGE_TITLE}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${META_DESCRIPTION}">`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${PAGE_TITLE}">`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${META_DESCRIPTION}">`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="${OG_IMAGE}">`
  );

  if (!html.includes('rel="canonical"')) {
    html = html.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">${seoBlock}`
    );
  } else {
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${CANONICAL_URL}">`);
  }

  return html;
}

function fixAccessibility(html) {
  return html
    .replace(
      'src="assets/hero.png" alt="" class="hero-bg-img',
      'src="assets/hero.webp" alt="Mateus Ribeiro apresentando aula gratuita sobre liderança e posicionamento" class="hero-bg-img'
    )
    .replace(
      'src="assets/hero.png" alt="" loading="eager"',
      'src="assets/hero.webp" alt="Mateus Ribeiro apresentando aula gratuita sobre liderança e posicionamento" loading="eager"'
    )
    .replace(
      'src="assets/mateus.png" alt="Mateus Ribeiro"',
      'src="assets/mateus.webp" alt="Mateus Ribeiro, mentor e treinador de líderes"'
    );
}

async function copyAssets() {
  const assetsSrc = path.join(ROOT, 'assets');
  const assetsDest = path.join(DIST, 'assets');
  ensureDir(assetsDest);

  const imageMap = new Map();
  let sharp;

  try {
    sharp = require('sharp');
  } catch {
    sharp = null;
  }

  if (!fs.existsSync(assetsSrc)) {
    log('assets', 'pasta assets/ ausente — pulando');
    return imageMap;
  }

  for (const entry of fs.readdirSync(assetsSrc)) {
    if (entry.startsWith('.')) continue;

    const srcPath = path.join(assetsSrc, entry);
    const ext = path.extname(entry).toLowerCase();
    const baseName = path.basename(entry, ext);

    if (sharp && (ext === '.png' || ext === '.jpg' || ext === '.jpeg')) {
      const webpName = `${baseName}.webp`;
      const webpDest = path.join(assetsDest, webpName);
      await sharp(srcPath).webp({ quality: 82, effort: 4 }).toFile(webpDest);
      imageMap.set(`assets/${entry}`, `assets/${webpName}`);
      log('assets', `convertido ${entry} → ${webpName}`);
      continue;
    }

    fs.copyFileSync(srcPath, path.join(assetsDest, entry));
  }

  return imageMap;
}

function compileTailwind(customCssPath) {
  const tempInput = path.join(ROOT, '.build-tailwind.css');
  const tailwindBase = fs.readFileSync(path.join(ROOT, 'src/styles/tailwind.css'), 'utf8');
  const customCss = fs.readFileSync(customCssPath, 'utf8');
  fs.writeFileSync(tempInput, `${tailwindBase}\n${customCss}`);
  const outputPath = path.join(DIST, 'css', 'tailwind.css');

  execSync(`npx tailwindcss -i "${tempInput}" -o "${outputPath}" --minify`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  fs.unlinkSync(tempInput);
  fs.unlinkSync(customCssPath);
  return outputPath;
}

function minifyCssBundle(files) {
  const combined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const result = new CleanCSS({ level: 2 }).minify(combined);
  if (result.errors.length) {
    throw new Error(result.errors.join('\n'));
  }
  return result.styles;
}

function extractApplicationScripts(html) {
  const scripts = [];
  const pattern = /<script>([\s\S]*?)<\/script>/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const content = match[1].trim();
    if (content.includes('REDIRECT_URL') || content.includes('AOS.init')) {
      scripts.push(content);
    }
  }

  if (!scripts.length) {
    throw new Error('Scripts de aplicação não encontrados.');
  }

  return scripts.join('\n\n');
}

async function buildJavaScript(sourceHtml, imageMap) {
  let js = extractApplicationScripts(sourceHtml);

  for (const [from, to] of imageMap.entries()) {
    js = js.split(from).join(to);
  }

  const minified = await minifyJs(js, {
    compress: true,
    mangle: {
      reserved: ['abrirPopup', 'fecharPopup'],
    },
    format: { comments: false },
  });

  if (!minified.code) {
    throw new Error('Falha ao minificar JavaScript.');
  }

  const outPath = path.join(DIST, 'js', 'main.min.js');
  fs.writeFileSync(outPath, minified.code);
  return outPath;
}

function transformHtml(sourceHtml, imageMap) {
  let html = sourceHtml;
  const protectedScripts = protectThirdPartyScripts(html);
  html = protectedScripts.html;

  const customCss = extractBetween(html, '<style>', '</style>');
  const customCssPath = path.join(ROOT, '.build-custom.css');
  fs.writeFileSync(customCssPath, customCss);

  html = html.replace(/<style>[\s\S]*?<\/style>\s*/g, '');
  html = html.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/g, '');
  html = html.replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>\s*/g, '');

  const headLinks = `
    <link rel="stylesheet" href="css/main.min.css">`;

  html = html.replace(
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">',
    `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">${headLinks}`
  );

  html = html.replace(
    /<script>[\s\S]*?REDIRECT_URL[\s\S]*?<\/script>\s*<script src="https:\/\/unpkg.com\/aos@2\.3\.1\/dist\/aos\.js"><\/script>\s*<script>[\s\S]*?AOS\.init[\s\S]*?<\/script>/,
    '<script src="https://unpkg.com/aos@2.3.1/dist/aos.js" defer></script>\n    <script src="js/main.min.js" defer></script>'
  );

  html = injectSeoAndPerformance(html);
  html = fixAccessibility(html);

  for (const [from, to] of imageMap.entries()) {
    html = html.split(from).join(to);
  }

  html = restoreThirdPartyScripts(html, protectedScripts.placeholders);
  return { html, customCssPath };
}

async function main() {
  log('start', 'limpando dist/');
  rimraf(DIST);
  ensureDir(path.join(DIST, 'css'));
  ensureDir(path.join(DIST, 'js'));
  ensureDir(path.join(DIST, 'assets'));

  const sourceHtml = readSourceHtml();
  assertNoForbiddenBrands('index.html (fonte)', sourceHtml);

  const imageMap = await copyAssets();
  const { html: transformedHtml, customCssPath } = transformHtml(sourceHtml, imageMap);

  log('css', 'compilando Tailwind purgado');
  const tailwindPath = compileTailwind(customCssPath);

  const mainCssPath = path.join(DIST, 'css', 'main.min.css');
  const mainCss = minifyCssBundle([tailwindPath]);
  fs.writeFileSync(mainCssPath, mainCss);
  fs.unlinkSync(tailwindPath);

  log('js', 'minificando JavaScript');
  await buildJavaScript(sourceHtml, imageMap);

  log('html', 'minificando index.html');
  const minifiedHtml = await minifyHtml(transformedHtml, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyCSS: false,
    minifyJS: false,
    keepClosingSlash: true,
  });

  const distHtmlPath = path.join(DIST, 'index.html');
  fs.writeFileSync(distHtmlPath, minifiedHtml);

  assertNoForbiddenBrands('dist/index.html', minifiedHtml);
  assertNoForbiddenBrands('dist/js/main.min.js', fs.readFileSync(path.join(DIST, 'js', 'main.min.js'), 'utf8'));

  const stats = {
    html: fs.statSync(distHtmlPath).size,
    css: fs.statSync(mainCssPath).size,
    js: fs.statSync(path.join(DIST, 'js', 'main.min.js')).size,
    assets: fs.readdirSync(path.join(DIST, 'assets')).reduce((total, file) => {
      return total + fs.statSync(path.join(DIST, 'assets', file)).size;
    }, 0),
  };

  log(
    'done',
    `dist pronta — HTML ${(stats.html / 1024).toFixed(1)}KB | CSS ${(stats.css / 1024).toFixed(1)}KB | JS ${(stats.js / 1024).toFixed(1)}KB | Assets ${(stats.assets / 1024 / 1024).toFixed(2)}MB`
  );
}

main().catch((error) => {
  console.error('[build] erro:', error);
  process.exit(1);
});
