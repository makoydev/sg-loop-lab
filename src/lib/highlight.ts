/*
 * A deliberately small syntax highlighter for the snippets shown in the labs.
 * The code on screen is static, authored content, so a line scanner is enough
 * and keeps the bundle free of a full grammar engine.
 */

export type Lang = 'python' | 'ts' | 'sql' | 'text'
export type TokKind = 'kw' | 'str' | 'com' | 'num' | 'fn' | 'type' | 'dec' | 'op' | 'plain'
export type Tok = { text: string; kind: TokKind }

const KEYWORDS: Record<Lang, ReadonlySet<string>> = {
  python: new Set(
    'def return if elif else for while in not and or is None True False class import from as with try except finally raise pass break continue lambda yield async await global nonlocal assert del'.split(
      ' ',
    ),
  ),
  ts: new Set(
    'const let var function return if else for while of in new class extends import from export default async await try catch finally throw typeof instanceof null undefined true false type interface implements public private readonly static this switch case break continue void as satisfies delete yield do'.split(
      ' ',
    ),
  ),
  sql: new Set(
    'select from where and or not update set insert into values delete begin commit rollback for returning on conflict do nothing create table unique index primary key limit order by join left as null is in transaction if exists'.split(
      ' ',
    ),
  ),
  text: new Set(),
}

const TS_PRIMITIVES: ReadonlySet<string> = new Set(
  'string number boolean unknown never any bigint symbol object'.split(' '),
)

const PY_STRING = /^[rbfuRBFU]{0,2}("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/
const PY_TRIPLE = /^[rbfuRBFU]{0,2}("""|''')/
const C_STRING = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/
const NUMBER = /^(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)/
const IDENT = /^[A-Za-z_$][\w$]*/
const DECORATOR = /^@[A-Za-z_][\w.]*/
const SPACE = /^\s+/

/** Tokenize source into lines of coloured tokens. */
export function highlight(code: string, lang: Lang): Tok[][] {
  const lines = code.split('\n')
  if (lang === 'text') return lines.map((text) => [{ text, kind: 'plain' as const }])

  // Closing delimiter of a construct left open on a previous line.
  let open: { close: string; kind: TokKind } | null = null

  return lines.map((line) => {
    const toks: Tok[] = []
    const push = (text: string, kind: TokKind) => {
      if (!text) return
      const last = toks[toks.length - 1]
      if (last && last.kind === kind) last.text += text
      else toks.push({ text, kind })
    }

    let i = 0
    while (i < line.length) {
      if (open) {
        const end = line.indexOf(open.close, i)
        if (end === -1) {
          push(line.slice(i), open.kind)
          i = line.length
          break
        }
        push(line.slice(i, end + open.close.length), open.kind)
        i = end + open.close.length
        open = null
        continue
      }

      const rest = line.slice(i)

      // line comments
      if (
        (lang === 'python' && rest[0] === '#') ||
        (lang === 'ts' && rest.startsWith('//')) ||
        (lang === 'sql' && rest.startsWith('--'))
      ) {
        push(rest, 'com')
        break
      }

      // block comments and docstrings
      if (lang === 'ts' && rest.startsWith('/*')) {
        open = { close: '*/', kind: 'com' }
        push('/*', 'com')
        i += 2
        continue
      }
      if (lang === 'python') {
        const triple = PY_TRIPLE.exec(rest)
        if (triple) {
          open = { close: triple[1], kind: 'str' }
          push(triple[0], 'str')
          i += triple[0].length
          continue
        }
      }

      const str = (lang === 'python' ? PY_STRING : C_STRING).exec(rest)
      if (str) {
        push(str[0], 'str')
        i += str[0].length
        continue
      }

      if (lang !== 'sql') {
        const dec = DECORATOR.exec(rest)
        if (dec) {
          push(dec[0], 'dec')
          i += dec[0].length
          continue
        }
      }

      const num = NUMBER.exec(rest)
      if (num) {
        push(num[0], 'num')
        i += num[0].length
        continue
      }

      const ident = IDENT.exec(rest)
      if (ident) {
        const word = ident[0]
        const after = rest.slice(word.length)
        const isKeyword =
          lang === 'sql' ? KEYWORDS.sql.has(word.toLowerCase()) : KEYWORDS[lang].has(word)
        let kind: TokKind = 'plain'
        if (isKeyword) kind = 'kw'
        else if (lang === 'ts' && TS_PRIMITIVES.has(word)) kind = 'type'
        else if (/^\s*\(/.test(after)) kind = 'fn'
        else if (lang !== 'sql' && /^[A-Z]/.test(word)) kind = 'type'
        push(word, kind)
        i += word.length
        continue
      }

      const space = SPACE.exec(rest)
      if (space) {
        push(space[0], 'plain')
        i += space[0].length
        continue
      }

      push(rest[0], 'op')
      i += 1
    }
    return toks
  })
}
