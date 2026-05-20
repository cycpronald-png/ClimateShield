const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

(async () => {
  const server = spawn('npm', ['run', 'preview']);
  await new Promise(r => setTimeout(r, 2000));
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:4173');
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
  server.kill();
})();
