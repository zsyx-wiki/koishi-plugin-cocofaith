// 使用 TypeScript Printer 统一源码格式。
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
function files(entry) {
  if (!fs.existsSync(entry)) return []
  if (fs.statSync(entry).isDirectory()) return fs.readdirSync(entry).flatMap(name => files(path.join(entry, name)))
  return entry.endsWith('.ts') && !entry.includes(`${path.sep}data${path.sep}`) ? [entry] : []
}
for (const file of process.argv.slice(2).flatMap(files)) {
  const text = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const result = ts.transform(source, [context => {
    const visit = node => {
      node = ts.visitEachChild(node, visit, context)
      let updated
      if (ts.isBlock(node)) updated = ts.factory.createBlock(node.statements, true)
      if (ts.isObjectLiteralExpression(node) && node.properties.length > 2) updated = ts.factory.createObjectLiteralExpression(node.properties, true)
      if (!updated) return node
      ts.setOriginalNode(updated, node)
      ts.setTextRange(updated, node)
      return updated
    }
    return root => ts.visitNode(root, visit)
  }])
  fs.writeFileSync(file, printer.printFile(result.transformed[0]))
  result.dispose()
}
