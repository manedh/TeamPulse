import fs from 'node:fs';
fs.mkdirSync('deployment',{recursive:true});
const js=fs.readFileSync('dist/app.js','utf8').replace(/<\/script/gi,'<\\/script');
const favicon='data:image/png;base64,'+fs.readFileSync('public/favicon.png').toString('base64');
const css=fs.readFileSync('dist/style.css','utf8');
fs.writeFileSync('deployment/Index.html',`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="referrer" content="no-referrer"><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TeamPulse - Sawai Associates</title><link rel="icon" type="image/png" href="${favicon}"><style>${css}</style></head><body><div id="root"></div><script type="module">${js}</script></body></html>`);
console.log('Apps Script Index.html packaged successfully');
