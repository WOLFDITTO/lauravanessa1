const https = require('https');

const REPO   = 'WOLFDITTO/lauravanessa1';
const BRANCH = 'main';

function ghRequest(method, filePath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/contents/${encodeURIComponent(filePath)}`,
      method,
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'VanessaCMS/1.0',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', d => (raw += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password, action, sha, html, filename, imageData } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  // ── GET current index.html ──────────────────────────────────────────────
  if (action === 'get') {
    const r = await ghRequest('GET', 'index.html');
    if (r.status !== 200) return res.status(500).json({ error: 'No se pudo leer el archivo' });
    const content = Buffer.from(r.data.content, 'base64').toString('utf8');
    return res.json({ success: true, html: content, sha: r.data.sha });
  }

  // ── SAVE updated index.html ─────────────────────────────────────────────
  if (action === 'save-html') {
    if (!html || !sha) return res.status(400).json({ error: 'Faltan datos' });
    const encoded = Buffer.from(html, 'utf8').toString('base64');
    const r = await ghRequest('PUT', 'index.html', {
      message: 'Contenido actualizado via admin CMS',
      content: encoded,
      sha,
      branch: BRANCH
    });
    if (r.status !== 200 && r.status !== 201)
      return res.status(500).json({ error: 'Error al guardar', detail: r.data });
    return res.json({ success: true });
  }

  // ── SAVE image file ─────────────────────────────────────────────────────
  if (action === 'save-image') {
    if (!filename || !imageData) return res.status(400).json({ error: 'Faltan datos' });
    const allowed = [
      'vanessa-hero_upscaled.webp',
      'vanessa-sobre-mi_upscaled.webp',
      'vanessa-de-pie_upscaled.webp'
    ];
    if (!allowed.includes(filename)) return res.status(400).json({ error: 'Archivo no permitido' });

    const existing = await ghRequest('GET', filename);
    const existingSha = existing.status === 200 ? existing.data.sha : undefined;

    const body = {
      message: `Imagen actualizada: ${filename}`,
      content: imageData,
      branch: BRANCH,
      ...(existingSha ? { sha: existingSha } : {})
    };
    const r = await ghRequest('PUT', filename, body);
    if (r.status !== 200 && r.status !== 201)
      return res.status(500).json({ error: 'Error al subir imagen', detail: r.data });
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Acción inválida' });
};
