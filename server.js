const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const fs = require('fs');
const urlLib = require('url');

const app = express();
const PORT = process.env.PORT || 10000;

const MAX_PAGES = 30;
const MAX_DEPTH = 2;
const DELAY = 500;

// ------------------------------
// STABLE ID FROM DOMAIN
// ------------------------------
function stableIdFromUrl(url) {
  const domain = new URL(url).hostname;
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  }
  return hash.toString();
}

// ------------------------------
// HELPERS
// ------------------------------
function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function loadRobots(base) {
  try {
    const robotsUrl = new URL('/robots.txt', base).href;
    const res = await axios.get(robotsUrl);
    return robotsParser(robotsUrl, res.data);
  } catch {
    return robotsParser('', '');
  }
}

// ------------------------------
// MAIN CRAWLER
// ------------------------------
async function crawl(startUrl) {
  const start = new URL(startUrl);
  const origin = start.origin;

  const robots = await loadRobots(origin);
  const visited = new Set();
  const queue = [{ url: start.href, depth: 0 }];
  const results = [];

  while (queue.length && visited.size < MAX_PAGES) {
    const { url, depth } = queue.shift();
    if (visited.has(url) || depth > MAX_DEPTH) continue;
    if (!robots.isAllowed(url, 'SearchmiumBot')) continue;

    visited.add(url);
    console.log('Crawling:', url);

    try {
      await wait(DELAY);
      const res = await axios.get(url);
      const $ = cheerio.load(res.data);

      const text = $('body').text().replace(/\s+/g, ' ').trim();
      results.push({ url, text });

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const absolute = urlLib.resolve(url, href).split('#')[0];

        try {
          const u = new URL(absolute);
          if (u.origin === origin && !visited.has(absolute)) {
            queue.push({ url: absolute, depth: depth + 1 });
          }
        } catch {}
      });
    } catch (err) {
      console.log('Error:', err.message);
    }
  }

  // ------------------------------
  // SAVE USING STABLE ID
  // ------------------------------
  const id = stableIdFromUrl(startUrl);
  const filePath = `crawled/${id}.html`;

  const html = `
  <html>
  <head><meta charset="utf-8"><title>Crawl ${id}</title></head>
  <body>
  <h1>Crawl ID: ${id}</h1>
  <h2>Domain: ${startUrl}</h2>
  ${results.map(r => `<h3>${r.url}</h3><p>${r.text}</p>`).join('')}
  </body>
  </html>
  `;

  fs.writeFileSync(filePath, html);

  return id;
}

// ------------------------------
// ROUTES
// ------------------------------
app.get('/crawl', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.send('Add ?url=');

  const id = await crawl(target);

  res.send(`Crawl complete. View at https://searchmium-crawler./crawled.html?id=${id}`);
});

app.get('/crawled.html', (req, res) => {
  const id = req.query.id || req.query[0];
  if (!id) return res.send('No ID provided.');

  const filePath = `crawled/${id}.html`;

  if (!fs.existsSync(filePath)) {
    return res.send('Crawl not found.');
  }

  res.sendFile(__dirname + '/' + filePath);
});

// ------------------------------
app.listen(PORT, () => console.log('Searchmium crawler running'));
