const fs = require("node:fs");
const path = require("node:path");
const prettier = require("prettier");

function files(entry) {
  if (!fs.existsSync(entry)) return [];
  if (fs.statSync(entry).isDirectory()) {
    return fs.readdirSync(entry).flatMap((name) => files(path.join(entry, name)));
  }
  return /\.(?:ts|cjs)$/.test(entry) && !entry.includes(`${path.sep}data${path.sep}`)
    ? [entry]
    : [];
}

async function main() {
  for (const file of process.argv.slice(2).flatMap(files)) {
    const source = fs.readFileSync(file, "utf8");
    const config = await prettier.resolveConfig(file);
    const formatted = await prettier.format(source, {
      printWidth: 100,
      tabWidth: 2,
      ...config,
      filepath: file,
    });
    if (formatted !== source) fs.writeFileSync(file, formatted);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
