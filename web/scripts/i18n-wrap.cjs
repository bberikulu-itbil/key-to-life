// Wraps every Kazakh (Cyrillic) UI string in src that is not translated yet with tx(). usage: node scripts/i18n-wrap.cjs [--dry]
// Already wrapped text, i18n.ts itself and tests are left alone. Then run `npm run i18n` to see what needs translating.
const ts = require('typescript')
const fs = require('fs'), path = require('path')
const WEB = path.join(__dirname, '..')
const SRC = path.join(WEB, 'src')
const DRY = process.argv.includes('--dry')
const CY = /[Ѐ-ӿ]/
const SKIP = new Set(['lib/i18n.ts', 'components/LangPicker.tsx'])   // the picker speaks every language at once

const cfg = ts.getParsedCommandLineOfConfigFile(path.join(WEB, 'tsconfig.app.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(String(d.messageText)) } })
const program = ts.createProgram(cfg.fileNames, cfg.options)
const checker = program.getTypeChecker()
const keys = new Set()

const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
const call = (key, args) => { keys.add(key); return `tx(${q(key)}${args.map((a) => ', ' + a).join('')})` }

// React's JSX text rule: lines are trimmed (except the outer edges of a single line), empty lines dropped, joined by one space
function jsxText(raw) {
  if (!raw.includes('\n')) return raw
  const lines = raw.split(/\r\n|\n|\r/)
  const out = []
  lines.forEach((l, i) => {
    let s = l
    if (i > 0) s = s.replace(/^[ \t]+/, '')
    if (i < lines.length - 1) s = s.replace(/[ \t]+$/, '')
    if (s) out.push(s)
  })
  return out.join(' ')
}

function primitive(type) {
  if (type.isUnion()) return type.types.every(primitive)
  const f = type.flags
  return !!(f & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.BigIntLike))
}
const hasJsx = (n) => { let found = false; (function v(x) { if (found) return; if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) { found = true; return } ts.forEachChild(x, v) })(n); return found }

function skipLiteral(n) {
  const p = n.parent
  if (!p) return true
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p)) return true
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isEnumMember(p) || ts.isPropertyDeclaration(p)) && p.name === n) return true
  if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'tx') return true
  return false
}

/** Text of node `n` with every translatable piece inside it rewritten. */
function rewrite(n, sf) {
  const edits = []
  collect(n, sf, edits)
  let text = n.getText(sf)
  const base = n.getStart(sf)
  edits.sort((a, b) => b.start - a.start)
  for (const e of edits) text = text.slice(0, e.start - base) + e.text + text.slice(e.end - base)
  return text
}

function collect(n, sf, edits) {
  if (ts.isStringLiteral(n) && CY.test(n.text) && !skipLiteral(n)) {
    const r = call(n.text, [])
    edits.push({ start: n.getStart(sf), end: n.getEnd(), text: ts.isJsxAttribute(n.parent) ? `{${r}}` : r })
    return
  }
  if (ts.isNoSubstitutionTemplateLiteral(n) && CY.test(n.text) && !(n.parent && ts.isTaggedTemplateExpression(n.parent))) {
    edits.push({ start: n.getStart(sf), end: n.getEnd(), text: call(n.text, []) })
    return
  }
  if (ts.isTemplateExpression(n) && !(n.parent && ts.isTaggedTemplateExpression(n.parent)) && (CY.test(n.head.text) || n.templateSpans.some((s) => CY.test(s.literal.text)))) {
    let key = n.head.text
    const args = []
    n.templateSpans.forEach((s, i) => { key += `{${i}}` + s.literal.text; args.push(rewrite(s.expression, sf)) })
    edits.push({ start: n.getStart(sf), end: n.getEnd(), text: call(key, args) })
    return
  }
  if ((ts.isJsxElement(n) || ts.isJsxFragment(n)) && n.children.some((c) => ts.isJsxText(c) && CY.test(c.text))) {
    // attributes of the opening tag first
    if (ts.isJsxElement(n)) collect(n.openingElement, sf, edits)
    const kids = n.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces))
    const mergeable = kids.length > 1 && kids.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression && !hasJsx(c.expression) && primitive(checker.getTypeAtLocation(c.expression))))
    if (mergeable) {
      let key = '', args = []
      for (const c of kids) {
        if (ts.isJsxText(c)) key += jsxText(c.getFullText(sf))
        else { key += `{${args.length}}`; args.push(rewrite(c.expression, sf)) }
      }
      const first = kids[0], last = kids[kids.length - 1]
      const start = ts.isJsxText(first) ? first.getFullStart() : first.getStart(sf)
      const lead = key.match(/^\s*/)[0], trail = key.match(/\s*$/)[0]
      const sp = (s) => (s ? `{' '}` : '')
      edits.push({ start, end: last.getEnd(), text: `${sp(lead)}{${call(key.slice(lead.length, key.length - trail.length), args)}}${sp(trail)}` })
    } else {
      for (const c of n.children) {
        if (ts.isJsxText(c) && CY.test(c.text)) {
          const raw = c.getFullText(sf)
          const vis = jsxText(raw)
          // keep the visible edge spaces outside the key so translations need not carry them
          const lead = vis.match(/^\s*/)[0], trail = vis.match(/\s*$/)[0]
          const core = vis.slice(lead.length, vis.length - trail.length)
          const sp = (s) => (s ? `{' '}` : '')
          edits.push({ start: c.getFullStart(), end: c.getEnd(), text: `${sp(lead)}{${call(core, [])}}${sp(trail)}` })
        } else collect(c, sf, edits)
      }
    }
    if (ts.isJsxElement(n)) collect(n.closingElement, sf, edits)
    return
  }
  ts.forEachChild(n, (c) => collect(c, sf, edits))
}

let changed = 0
for (const sf of program.getSourceFiles()) {
  const rel = path.relative(SRC, sf.fileName)
  if (sf.isDeclarationFile || rel.startsWith('..') || rel.endsWith('.test.ts') || SKIP.has(rel)) continue
  const before = keys.size
  const edits = []
  collect(sf, sf, edits)
  if (!edits.length) continue
  let text = sf.getFullText()
  edits.sort((a, b) => b.start - a.start)
  for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end)
  let imp = path.relative(path.dirname(sf.fileName), path.join(SRC, 'lib/i18n')).replace(/\\/g, '/')
  if (!imp.startsWith('.')) imp = './' + imp
  if (!/import \{[^}]*\btx\b[^}]*\} from '[^']*i18n'/.test(text)) {
    // after the last import statement
    const lastImport = [...text.matchAll(/^import[\s\S]*?from '[^']*'\n/gm)].pop()
    const at = lastImport ? lastImport.index + lastImport[0].length : 0
    text = text.slice(0, at) + `import { tx } from '${imp}'\n` + text.slice(at)
  }
  changed++
  if (!DRY) fs.writeFileSync(sf.fileName, text)
  console.log(rel, edits.length, 'edits,', keys.size - before, 'new keys')
}
console.log(changed, 'files;', keys.size, 'keys')
