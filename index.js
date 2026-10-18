const fs = require("node:fs/promises");
const path = require("node:path");
const MarkdownIt = require("markdown-it");
const puppeteer = require("puppeteer");

const rootDir = __dirname;
const exportDir = path.join(rootDir, "export");
const markdown = new MarkdownIt({ html: true });

async function findInputFiles(args, limit) {
  const files = args.length > 0
    ? args
        .map((file) => path.resolve(process.cwd(), file))
        .filter((file) => path.basename(file).toLowerCase() !== "readme.md" && path.extname(file) === ".md")
    : (await fs.readdir(rootDir))
        .filter((file) => /^(.*)\.md$/i.test(file) && file.toLowerCase() !== "readme.md")
        .map((file) => path.join(rootDir, file));

  const filesWithModificationTime = await Promise.all(
    files.map(async (file) => ({
      file,
      modifiedAt: (await fs.stat(file)).mtimeMs,
    })),
  );

  const sorted = filesWithModificationTime
    .sort((left, right) => right.modifiedAt - left.modifiedAt || left.file.localeCompare(right.file, "ru"))
    .map(({ file }) => file);

  return limit ? sorted.slice(0, limit) : sorted;
}

function createHtml(title, content) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: Arial, sans-serif; font-size: 12pt; color: #111; }
    h1 { font-size: 20pt; }
    h2 { font-size: 15pt; margin-top: 1.2em; }
    table { width: 100%; border-collapse: collapse; margin: 0.5em 0 1em; }
    th, td { border: 1px solid #555; padding: 6px 8px; text-align: left; }
    tr { break-inside: avoid; }
  </style>
</head>
<body>${content}</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = /^\d+$/.test(args[0] ?? "") ? Number(args.shift()) : 0;
  const inputFiles = await findInputFiles(args, limit);
  if (inputFiles.length === 0) {
    throw new Error("Не найдены Markdown-файлы.");
  }

  await fs.mkdir(exportDir, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });

  try {
    for (const inputFile of inputFiles) {
      const source = await fs.readFile(inputFile, "utf8");
      const title = path.basename(inputFile, path.extname(inputFile));
      const outputFile = path.join(exportDir, `${title}.pdf`);
      const page = await browser.newPage();

      try {
        await page.setContent(createHtml(title, markdown.render(source)), {
          waitUntil: "load",
        });
        await page.pdf({
          path: outputFile,
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        });
      } finally {
        await page.close();
      }

      console.log(`Создан файл: ${path.relative(rootDir, outputFile)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
