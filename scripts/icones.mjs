// Génère les icônes PNG de l'appli à partir de public/favicon.svg (node scripts/icones.mjs).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const taille of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: taille, height: taille } })
  await page.setContent(`<body style="margin:0;background:#000">${svg.replace('<svg ', `<svg width="${taille}" height="${taille}" `)}</body>`)
  await page.screenshot({ path: new URL(`../public/icons/icon-${taille}.png`, import.meta.url).pathname })
  await page.close()
}
await browser.close()
