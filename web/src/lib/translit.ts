/**
 * Transliterate Kazakh / Cyrillic names into Latin.
 * Useful for official certificates, international tests, and Olympiad records.
 */

const MAP: Record<string, string> = {
  А: 'A', а: 'a',
  Ә: 'A', ә: 'a',
  Б: 'B', б: 'b',
  В: 'V', в: 'v',
  Г: 'G', г: 'g',
  Ғ: 'G', ғ: 'g',
  Д: 'D', д: 'd',
  Е: 'E', е: 'e',
  Ё: 'Yo', ё: 'yo',
  Ж: 'Zh', ж: 'zh',
  З: 'Z', з: 'z',
  И: 'I', и: 'i',
  Й: 'Y', й: 'y',
  К: 'K', к: 'k',
  Қ: 'Q', қ: 'q',
  Л: 'L', л: 'l',
  М: 'M', м: 'm',
  Н: 'N', н: 'n',
  Ң: 'N', ң: 'n',
  О: 'O', о: 'o',
  Ө: 'O', ө: 'o',
  П: 'P', п: 'p',
  Р: 'R', р: 'r',
  С: 'S', с: 's',
  Т: 'T', т: 't',
  У: 'U', у: 'u',
  Ұ: 'U', ұ: 'u',
  Ү: 'U', ү: 'u',
  Ф: 'F', ф: 'f',
  Х: 'Kh', х: 'kh',
  Һ: 'H', һ: 'h',
  Ц: 'Ts', ц: 'ts',
  Ч: 'Ch', ч: 'ch',
  Ш: 'Sh', ш: 'sh',
  Щ: 'Sh', щ: 'sh',
  Ъ: '', ъ: '',
  Ы: 'Y', ы: 'y',
  І: 'I', і: 'i',
  Ь: '', ь: '',
  Э: 'E', э: 'e',
  Ю: 'Yu', ю: 'yu',
  Я: 'Ya', я: 'ya',
}

export function toLatin(str: string): string {
  let out = ''
  for (const ch of str) {
    out += MAP[ch] ?? ch
  }
  return out
}

const CONS = 'bdfgklmnprstvz'
const VOW = 'aeiou'
export function makeEasyPassword(): string {
  const rnd = (n: number) => Math.floor(Math.random() * n)
  return (
    Array.from({ length: 3 }, () => CONS[rnd(CONS.length)] + VOW[rnd(VOW.length)]).join('') +
    String(10 + rnd(90))
  )
}

