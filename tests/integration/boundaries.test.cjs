const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function* sources(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* sources(file)
    else if (entry.name.endsWith('.ts')) yield file
  }
}

test('Core and Business depend on public contracts without importing each other', () => {
  const root = path.resolve(__dirname, '../../src')
  for (const [layer, other] of [['core', 'business'], ['business', 'core']]) {
    const forbidden = path.join(root, other)
    for (const file of sources(path.join(root, layer))) {
      for (const { fileName } of ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true).importedFiles) {
        if (!fileName.startsWith('.')) continue
        const resolved = path.resolve(path.dirname(file), fileName)
        assert.ok(resolved !== forbidden && !resolved.startsWith(forbidden + path.sep), `${file} imports ${fileName}`)
        assert.notEqual(resolved, path.join(root, 'index'), `${file} imports the composition entry`)
      }
    }
  }
})

test('public gameplay contracts depend on SDK or other public API files, never implementations', () => {
  const root = path.resolve(__dirname, '../../src/business')
  const files = [...sources(path.join(root, 'contracts'))]
  for (const file of sources(path.join(root, 'modules'))) {
    if (path.basename(file) === 'api.ts') files.push(file)
  }
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    for (const statement of source.statements) {
      const name = statement.moduleSpecifier?.text
      if (!name?.startsWith('.')) continue
      assert.ok(name.endsWith('/api') || path.resolve(path.dirname(file), name) === path.join(root, 'contracts/gameplay'), `${file} references implementation ${name}`)
    }
  }
})
