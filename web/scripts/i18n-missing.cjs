// Lists tx('…') keys in src that a dictionary (src/i18n/*.json) lacks. Run: npm run i18n
// New Kazakh text: wrap it with scripts/i18n-wrap.cjs (or by hand), then add its en/tr/ru lines here.
const ts = require('typescript')
const fs = require('fs'), path = require('path')
const SRC = path.join(__dirname, '../src')
const used = new Set()
;(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { walk(p); continue }
    if (!/\.tsx?$/.test(f) || f.endsWith('.test.ts')) continue
    const sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    ;(function v(n) {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tx' && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) used.add(n.arguments[0].text)
      ts.forEachChild(n, v)
    })(sf)
  }
})(SRC)
let missing = 0
for (const l of ['en', 'tr', 'ru']) {
  const d = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n', `${l}.json`), 'utf8'))
  for (const k of used) if (!(k in d)) { missing++; console.log(`${l}: ${JSON.stringify(k)}`) }
}
console.log(missing ? `${missing} missing (shown in Kazakh until added)` : `all ${used.size} keys translated`)
