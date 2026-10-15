const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

function isPublished(metadata, run = execFileSync) {
  const spec = `${metadata.name}@${metadata.version}`
  let output
  try {
    output = run('npm', ['view', spec, 'version', '--json', '--registry=https://registry.npmjs.org'], {
      encoding: 'utf8', stdio: 'pipe', timeout: 60000,
    })
  } catch (error) {
    let code
    try { code = JSON.parse(String(error.stdout)).error?.code } catch {}
    if (code === 'E404') return false
    throw new Error(`Cannot check ${spec} on npm; refusing to treat a registry failure as an unpublished version.`, { cause: error })
  }
  if (JSON.parse(output) !== metadata.version) throw new Error(`Unexpected npm version response for ${spec}.`)
  return true
}

if (require.main === module) {
  try {
    const metadata = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const published = isPublished(metadata)
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.')
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `published=${published}\n`)
    console.log(`${metadata.name}@${metadata.version}: ${published ? 'already published; npm publish will be skipped' : 'not published; npm Trusted Publisher authorization is required'}.`)
  } catch (error) {
    console.error(error.message)
    if (error.cause?.stdout) console.error(String(error.cause.stdout))
    process.exitCode = 1
  }
}

module.exports = { isPublished }
