#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SOURCE_HTML = path.join(ROOT, 'index.html');
const DIST_HTML = path.join(ROOT, 'dist', 'index.html');
const DIST_JS = path.join(ROOT, 'dist', 'js', 'main.min.js');
const DIST_CSS = path.join(ROOT, 'dist', 'css', 'main.min.css');

const EXPECTED = {
  webhook: 'https://hook.us2.make.com/6qaglponybteo2l6d187c5p91i7r1tae?produto=w-lex',
  redirect: 'https://sndflw.com/i/webnar',
  produto: 'w-lex',
  canonical: 'https://mateusribeirolider.com/',
};

const FORBIDDEN = [
  /personal\s*trainer\s*academy/i,
  /personaltraineracademy/i,
  /pos\.personaltraineracademy\.com/i,
  /logoPTA/i,
  /logoPta/i,
  /instituto\s*valorize/i,
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function formatPhone(raw) {
  let value = raw.replace(/\D/g, '');
  if (value.startsWith('55') && value.length > 2) value = value.slice(2);
  value = value.slice(0, 11);
  let formatado = value;
  if (value.length > 2) formatado = `(${value.slice(0, 2)}) ` + value.slice(2);
  if (value.length > 7) formatado = formatado.slice(0, 10) + '-' + formatado.slice(10);
  return { formatado, raw: value };
}

function buildPayload({ nome, email, phoneRaw, utms = {}, pageUrl }) {
  const rawPhone = phoneRaw.replace(/\D/g, '');
  return {
    nome: nome.trim(),
    email: email.trim(),
    telefone: '+55' + rawPhone,
    utm_source: utms.utm_source || '',
    utm_term: utms.utm_term || '',
    utm_campaign: utms.utm_campaign || '',
    utm_medium: utms.utm_medium || '',
    utm_content: utms.utm_content || '',
    url: pageUrl,
    produto: EXPECTED.produto,
  };
}

function assertNoForbidden(label, content) {
  FORBIDDEN.forEach((pattern) => {
    assert.ok(!pattern.test(content), `${label} contém referência proibida: ${pattern}`);
  });
}

function testPhoneMask() {
  const cases = [
    { input: '11999887766', expected: '(11) 99988-7766', rawLen: 11 },
    { input: '5511999887766', expected: '(11) 99988-7766', rawLen: 11 },
    { input: '41978605100', expected: '(41) 97860-5100', rawLen: 11 },
    { input: '1133334444', expected: '(11) 33334-444', rawLen: 10 },
  ];

  cases.forEach(({ input, expected, rawLen }) => {
    const { formatado, raw } = formatPhone(input);
    assert.strictEqual(formatado, expected, `máscara falhou para ${input}`);
    assert.strictEqual(raw.length, rawLen, `raw length falhou para ${input}`);
  });

  assert.ok(formatPhone('123').raw.length < 10, 'telefone curto deve bloquear envio');
  console.log('✓ máscara de telefone');
}

function testPayloadShape() {
  const payload = buildPayload({
    nome: 'Bryan Johnson',
    email: 'brajohn2901@gmail.com',
    phoneRaw: '41978605100',
    utms: {
      utm_source: 'instagram',
      utm_term: 'webinar',
      utm_campaign: 'w-lex',
      utm_medium: 'social',
      utm_content: 'hero',
    },
    pageUrl: 'https://webnarmateus.vercel.app/?utm_source=instagram',
  });

  assert.deepStrictEqual(Object.keys(payload).sort(), [
    'email',
    'nome',
    'produto',
    'telefone',
    'url',
    'utm_campaign',
    'utm_content',
    'utm_medium',
    'utm_source',
    'utm_term',
  ]);
  assert.strictEqual(payload.telefone, '+5541978605100');
  assert.strictEqual(payload.produto, 'w-lex');
  console.log('✓ estrutura do payload');
  return payload;
}

function testSourceHtmlIntegrity() {
  const source = read(SOURCE_HTML);

  assert.ok(source.includes(`data-webhook="${EXPECTED.webhook}"`), 'webhook ausente no HTML fonte');
  assert.ok(source.includes(`data-redirect="${EXPECTED.redirect}"`), 'redirect ausente no HTML fonte');
  assert.ok(source.includes('id="form-webinar-mateus"'), 'form-webinar-mateus ausente');
  assert.ok(source.includes('id="popup-captura"'), 'popup-captura ausente');
  assert.ok(source.includes('id="btn-submit-lead"'), 'btn-submit-lead ausente');
  assert.ok(source.includes('id="lead-nome"'), 'lead-nome ausente');
  assert.ok(source.includes('id="lead-email"'), 'lead-email ausente');
  assert.ok(source.includes('id="lead-phone"'), 'lead-phone ausente');
  assert.ok(source.includes('mask-telefone'), 'mask-telefone ausente');
  assert.ok(source.includes('onclick="abrirPopup()"'), 'botão popup ausente');
  assert.ok(source.includes('type="button" id="btn-submit-lead"'), 'botão deve ser type=button');
  assert.ok(source.includes('onsubmit="event.preventDefault();"'), 'preventDefault inline ausente');
  assert.ok(source.includes('GTM-NS6D89DC'), 'GTM ausente no HTML fonte');
  assert.ok(source.includes('googletagmanager.com/gtm.js?id='), 'script GTM ausente no HTML fonte');
  assert.ok(source.includes('googletagmanager.com/ns.html?id=GTM-NS6D89DC'), 'noscript GTM ausente no HTML fonte');
  assert.ok(source.includes("produto: 'w-lex'"), 'produto w-lex ausente no JS fonte');
  assert.ok(!source.includes('name="utm_source"'), 'campos hidden não devem ter name (evita GET na URL)');
  assertNoForbidden('index.html (fonte)', source);
  console.log('✓ integridade do HTML fonte');
}

function testSeoTags(html, label) {
  assert.ok(html.includes('<title>Aula Gratuita | Mateus Ribeiro | LEX</title>'), `${label}: title ausente`);
  assert.ok(html.includes('name="description"'), `${label}: description ausente`);
  assert.ok(html.includes('name="viewport"'), `${label}: viewport ausente`);
  assert.ok(html.includes(`rel="canonical" href="${EXPECTED.canonical}"`), `${label}: canonical incorreta`);
  assert.ok(html.includes('property="og:title"'), `${label}: og:title ausente`);
  assert.ok(html.includes('property="og:description"'), `${label}: og:description ausente`);
  assert.ok(html.includes('property="og:image"'), `${label}: og:image ausente`);
  assert.ok(html.includes('property="og:url"'), `${label}: og:url ausente`);
  assert.ok(html.includes('name="twitter:card"'), `${label}: twitter:card ausente`);
  assert.ok(html.includes('rel="preconnect"'), `${label}: preconnect ausente`);
  console.log(`✓ SEO técnico (${label})`);
}

function testAccessibility(html, label) {
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  assert.ok(imgTags.length > 0, `${label}: nenhuma imagem encontrada`);

  imgTags.forEach((tag) => {
    assert.ok(/alt="[^"]+"/.test(tag), `${label}: imagem sem alt — ${tag.slice(0, 80)}`);
    assert.ok(!/alt=""/.test(tag), `${label}: imagem com alt vazio — ${tag.slice(0, 80)}`);
  });

  assert.ok(html.includes('<h1 '), `${label}: h1 ausente`);
  assert.ok((html.match(/<h2\b/gi) || []).length >= 3, `${label}: hierarquia h2 insuficiente`);
  console.log(`✓ acessibilidade (${label})`);
}

function testDistStructure() {
  const required = [
    DIST_HTML,
    DIST_JS,
    DIST_CSS,
    path.join(ROOT, 'dist', 'assets', 'hero.webp'),
    path.join(ROOT, 'dist', 'assets', 'mateus.webp'),
  ];

  required.forEach((file) => {
    assert.ok(fs.existsSync(file), `arquivo ausente em dist: ${path.relative(ROOT, file)}`);
  });

  const distHtml = read(DIST_HTML);
  const distJs = read(DIST_JS);
  const distCss = read(DIST_CSS);

  assert.ok(distHtml.includes(EXPECTED.webhook), 'webhook ausente em dist/index.html');
  assert.ok(distHtml.includes(EXPECTED.redirect), 'redirect ausente em dist/index.html');
  assert.ok(distJs.includes(EXPECTED.webhook), 'webhook ausente em dist/js/main.min.js');
  assert.ok(distJs.includes(EXPECTED.redirect), 'redirect ausente em dist/js/main.min.js');
  assert.ok(distJs.includes('abrirPopup'), 'abrirPopup ausente no JS minificado');
  assert.ok(distJs.includes('fecharPopup'), 'fecharPopup ausente no JS minificado');
  assert.ok(distJs.includes('location.replace'), 'redirect via location.replace ausente');
  assert.ok(distHtml.includes('js/main.min.js'), 'JS de produção não referenciado');
  assert.ok(distHtml.includes('css/main.min.css'), 'CSS de produção não referenciado');
  assert.ok(distHtml.includes('assets/hero.webp'), 'hero.webp não referenciado (desktop)');
  assert.ok(distHtml.includes('assets/mateus.webp'), 'mateus.webp não referenciado');
  assert.ok(
    distHtml.includes('hero-mobile-visual md:hidden') && distHtml.includes('mateus.webp'),
    'hero mobile deve usar mateus.webp'
  );
  assert.ok(!distHtml.includes('cdn.tailwindcss.com'), 'Tailwind CDN ainda presente em produção');
  assert.ok(!distHtml.includes('dashmonster'), 'DashMonster ainda presente em produção');
  assert.ok(distHtml.includes('GTM-NS6D89DC'), 'GTM ausente em produção');
  assert.ok(distHtml.includes('googletagmanager.com/gtm.js?id='), 'script GTM ausente em produção');
  assert.ok(distHtml.includes('googletagmanager.com/ns.html?id=GTM-NS6D89DC'), 'noscript GTM ausente em produção');
  assertNoForbidden('dist/index.html', distHtml);
  assertNoForbidden('dist/js/main.min.js', distJs);

  testSeoTags(distHtml, 'dist');
  testAccessibility(distHtml, 'dist');
  console.log('✓ estrutura e paridade dist/');
}

async function testWebhookLive(payload) {
  const testPayload = {
    ...payload,
    nome: '[TESTE AUTO] ' + payload.nome,
    email: `teste-automatizado+${Date.now()}@exemplo.com`,
  };

  const response = await fetch(EXPECTED.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
  });

  const body = await response.text();
  assert.ok(response.ok, `webhook retornou HTTP ${response.status}: ${body}`);
  console.log(`✓ webhook Make.com (HTTP ${response.status})`);
  return { status: response.status, body, payload: testPayload };
}

async function testRedirectLive() {
  const response = await fetch(EXPECTED.redirect, {
    method: 'GET',
    redirect: 'manual',
  });

  assert.ok(
    [200, 301, 302, 303, 307, 308].includes(response.status),
    `redirect retornou HTTP ${response.status}`
  );
  console.log(`✓ link de redirect (HTTP ${response.status})`);
}

function serveDist() {
  const distRoot = path.join(ROOT, 'dist');
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.webp': 'image/webp',
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(distRoot, urlPath === '/' ? 'index.html' : urlPath);

      if (!filePath.startsWith(distRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }

      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });

    server.on('error', reject);
  });
}

async function testStaticServerAssets() {
  const server = await serveDist();

  try {
    const targets = [
      '/',
      '/css/main.min.css',
      '/js/main.min.js',
      '/assets/hero.webp',
      '/assets/mateus.webp',
    ];

    for (const target of targets) {
      const response = await fetch(`${server.baseUrl}${target}`);
      assert.ok(response.ok, `falha ao carregar ${target} (HTTP ${response.status})`);

      if (target.endsWith('.webp')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        assert.ok(buffer.length > 1000, `${target} parece vazio`);
      }
    }

    const html = await (await fetch(`${server.baseUrl}/`)).text();
    assert.ok(html.includes('form-webinar-mateus'), 'HTML servido sem formulário');
    assert.ok(html.includes('sndflw.com/i/webnar'), 'HTML servido sem redirect');
    console.log('✓ servidor estático e assets carregando');
  } finally {
    await server.close();
  }
}

async function main() {
  console.log('\n=== Testes Webinar Mateus Ribeiro (w-lex) ===\n');

  if (!fs.existsSync(DIST_HTML)) {
    throw new Error('dist/ não encontrada — execute npm run build antes dos testes');
  }

  testPhoneMask();
  const samplePayload = testPayloadShape();
  testSourceHtmlIntegrity();
  testDistStructure();
  await testStaticServerAssets();

  const webhookResult = await testWebhookLive(samplePayload);
  await testRedirectLive();

  console.log('\n=== Resumo operacional ===\n');
  console.log('Webhook URL:', EXPECTED.webhook);
  console.log('Redirect URL:', EXPECTED.redirect);
  console.log('Canonical URL:', EXPECTED.canonical);
  console.log('\nPayload de exemplo enviado ao webhook:\n');
  console.log(JSON.stringify(webhookResult.payload, null, 2));
  console.log('\nResposta do webhook:', webhookResult.body || '(vazio)');
  console.log('\n✅ Todos os testes passaram.\n');
}

main().catch((error) => {
  console.error('\n❌ Teste falhou:', error.message);
  process.exit(1);
});
