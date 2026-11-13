// Genera la versión web instalable (PWA) en dist/ lista para subir a Netlify.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
execSync('npx expo export --platform web', { cwd: root, stdio: 'inherit' });

for (const f of fs.readdirSync(path.join(root, 'web'))) {
  fs.copyFileSync(path.join(root, 'web', f), path.join(dist, f));
}

fs.writeFileSync(
  path.join(dist, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'Mis Gastos',
      short_name: 'Mis Gastos',
      description: 'Entradas, salidas, imprevistos y pagos fijos por quincena, semana y mes.',
      lang: 'es-MX',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#F3F5F4',
      theme_color: '#0F766E',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    null,
    2,
  ),
);

const tags = `
    <meta name="theme-color" content="#0F766E" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Mis Gastos" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
`;
const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('</head>')) throw new Error('index.html sin </head>');
// viewport-fit=cover para respetar la zona segura (notch) del iPhone
html = html.replace(/(<meta name="viewport" content=")([^"]*)(")/, (m, a, b, c) => (b.includes('viewport-fit') ? m : `${a}${b}, viewport-fit=cover${c}`));
html = html.replace('<html lang="en">', '<html lang="es-MX">');
html = html.replace('</head>', `${tags}  </head>`);
fs.writeFileSync(indexPath, html);
console.log('\n✓ Listo: sube la carpeta dist/ a Netlify');
