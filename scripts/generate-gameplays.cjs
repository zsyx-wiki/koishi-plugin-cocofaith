const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const property = (node, name) =>
  node.properties.find(
    (entry) =>
      ts.isPropertyAssignment(entry) && entry.name.getText().replaceAll(/["']/g, "") === name,
  )?.initializer;

function metadata(source, directory) {
  const declaration = source.statements.find(
    (statement) => ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (!declaration)
    throw new Error(`玩法 ${directory} 需要在 index.ts 默认导出 defineBuiltInGameplay() 声明`);
  const call = declaration.expression;
  if (
    !ts.isCallExpression(call) ||
    call.expression.getText(source) !== "defineBuiltInGameplay" ||
    !call.arguments[0] ||
    !ts.isObjectLiteralExpression(call.arguments[0])
  )
    throw new Error(`玩法 ${directory} 需要直接声明 defineBuiltInGameplay({...})`);
  const object = call.arguments[0];
  const literal = (node, label) => {
    if (!node || !ts.isStringLiteralLike(node))
      throw new Error(`玩法 ${directory} 的 ${label} 必须是字符串字面量`);
    return node.text;
  };
  const order = property(object, "order");
  const signedOrder =
    order &&
    ts.isPrefixUnaryExpression(order) &&
    ts.isNumericLiteral(order.operand) &&
    [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(order.operator);
  if (order && !ts.isNumericLiteral(order) && !signedOrder)
    throw new Error(`玩法 ${directory} 的 order 必须是数字字面量`);
  const result = {
    directory,
    name: literal(property(object, "name"), "name"),
    description: literal(property(object, "description"), "description"),
    order: signedOrder
      ? (order.operator === ts.SyntaxKind.MinusToken ? -1 : 1) * Number(order.operand.text)
      : order
        ? Number(order.text)
        : 1000,
  };
  const config = property(object, "config");
  if (!config) return result;
  if (!ts.isObjectLiteralExpression(config))
    throw new Error(`玩法 ${directory} 的 config 必须是对象声明`);
  const definition = property(config, "definition");
  if (!definition || !ts.isIdentifier(definition))
    throw new Error(`玩法 ${directory} 的配置需要从 ./config 具名导入`);
  const imported = source.statements
    .flatMap((statement) => {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "./config")
        return [];
      const bindings = statement.importClause?.namedBindings;
      return bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
    })
    .find((binding) => binding.name.text === definition.text);
  if (!imported) throw new Error(`玩法 ${directory} 的配置需要从 ./config 具名导入`);
  return {
    ...result,
    key: literal(property(config, "key"), "config.key"),
    configExport: (imported.propertyName ?? imported.name).text,
  };
}

function writeGenerated(target, content) {
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content)
    fs.writeFileSync(target, content);
}

function generateGameplays(root = path.resolve(__dirname, "..")) {
  const directory = path.join(root, "src/business/modules");
  const modules = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const declarations = modules.map((name) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`非法玩法目录：${name}`);
    const entry = path.join(directory, name, "index.ts");
    if (!fs.existsSync(entry)) throw new Error(`玩法 ${name} 缺少 index.ts`);
    return metadata(
      ts.createSourceFile(entry, fs.readFileSync(entry, "utf8"), ts.ScriptTarget.Latest, true),
      name,
    );
  });
  const names = new Set();
  const keys = new Set();
  for (const entry of declarations) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(entry.name) || names.has(entry.name))
      throw new Error(`玩法名称无效或重复：${entry.name}`);
    if (!Number.isFinite(entry.order)) throw new Error(`玩法排序无效：${entry.name}`);
    names.add(entry.name);
    if (entry.key === undefined) continue;
    if (
      !/^[a-z][a-zA-Z0-9_]{0,63}$/.test(entry.key) ||
      keys.has(entry.key) ||
      ["modules", "constructor", "prototype", "__proto__"].includes(entry.key)
    )
      throw new Error(`配置键无效或重复：${entry.key}`);
    keys.add(entry.key);
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
  const configs = declarations
    .filter((entry) => entry.key)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const configContent = [
    "// 由 scripts/generate-gameplays.cjs 从各 index.ts 提取配置元数据，不加载玩法工厂。",
    'import { builtInConfigs } from "./framework/built-in";',
    ...configs.map(
      (entry) =>
        `import { ${entry.configExport} as ${binding(entry.directory)} } from "./modules/${entry.directory}/config";`,
    ),
    "",
    "export const BUILT_IN_CONFIGS = builtInConfigs([",
    ...configs.map(
      (entry) =>
        `  { name: ${JSON.stringify(entry.name)}, description: ${JSON.stringify(entry.description)}, config: { key: ${JSON.stringify(entry.key)}, definition: ${binding(entry.directory)} } },`,
    ),
    "] as const);",
    "",
  ].join("\n");
  writeGenerated(path.join(directory, "catalog.ts"), content);
  writeGenerated(path.join(root, "src/business/config-catalog.ts"), configContent);
  return modules;
}

if (require.main === module) generateGameplays();
module.exports = { generateGameplays };
