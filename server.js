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

  const html = `
  <html>
  <head><meta charset="utf-8"><title>Searchmium Crawl</title></head>
  <body>
  <h1>Searchmium Crawl Results</h1>
  ${results.map(r => `<h2>${r.url}</h2><p>${r.text}</p>`).join('')}
  </body>
  </html>
  `;

  fs.writeFileSync('crawled.html', html);
}

app.get('/crawl', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.send('Add ?url=');

  crawl(target);
  res.send('Crawl started. Check /crawled.html soon.');
});

app.get('/crawled.html', (req, res) => {
  if (!fs.existsSync('crawled.html')) {
    return res.send('No crawl yet.');
  }
  res.sendFile(__dirname + '/crawled.html');
});

app.listen(PORT, () => console.log('Searchmium crawler running'));
