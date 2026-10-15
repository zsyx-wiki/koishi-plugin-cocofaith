const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function generateGameplays(root = path.resolve(__dirname, "..")) {
  const directory = path.join(root, "src/business/modules");
  const modules = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of modules) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`非法玩法目录：${name}`);
    const entry = path.join(directory, name, "index.ts");
    if (!fs.existsSync(entry)) throw new Error(`玩法 ${name} 缺少 index.ts`);
    const source = ts.createSourceFile(
      entry,
      fs.readFileSync(entry, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    if (
      !source.statements.some(
        (statement) => ts.isExportAssignment(statement) && !statement.isExportEquals,
      )
    ) {
      throw new Error(`玩法 ${name} 需要在 index.ts 默认导出 defineBuiltInGameplay() 声明`);
    }
  }

  const binding = (name) => name.replaceAll("-", "_");
  const content = [
    "// 由 scripts/generate-gameplays.cjs 生成，玩法声明位于各目录 index.ts。",
    'import { collectBuiltInGameplays } from "../framework/built-in";',
    ...modules.map((name) => `import ${binding(name)} from "./${name}";`),
    "",
    "export const BUILT_IN_GAMEPLAYS = collectBuiltInGameplays([",
    ...modules.map((name) => `  ${binding(name)},`),
    "] as const);",
    "",
    ...modules.map((name) => `export * from "./${name}";`),
    "",
  ].join("\n");
  const target = path.join(directory, "catalog.ts");
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content)
    fs.writeFileSync(target, content);
  return modules;
}

if (require.main === module) generateGameplays();
module.exports = { generateGameplays };
