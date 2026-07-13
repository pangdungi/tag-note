import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
globalThis.document = dom.window.document
globalThis.Node = dom.window.Node

const MEMO_EDITOR_ZWSP = '\u200B'

function memoEmojiToken(id) {
  return `:m/${id}:`
}

function stripEditorZwsp(text) {
  return text.replaceAll(MEMO_EDITOR_ZWSP, '')
}

function blockHasMeaningfulContent(el) {
  if (el.querySelector('img[data-memo-emoji]')) return true
  if (el.querySelector('mark.memo-body-highlight')) return true
  return stripEditorZwsp(el.textContent ?? '').length > 0
}

function isCaretOnlyBlock(el) {
  if (el.tagName !== 'DIV' && el.tagName !== 'P') return false
  if (blockHasMeaningfulContent(el)) return false
  if (el.childNodes.length === 0) return true
  if (el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR') return true
  return stripEditorZwsp(el.textContent ?? '').length === 0
}

function walkCaretOnlyBlock(out, el) {
  let brCount = 0
  for (const child of el.childNodes) {
    if (child.nodeName === 'BR') brCount += 1
  }
  if (brCount > 0) {
    return out + '\n'.repeat(brCount)
  }
  let nested = out
  for (const child of el.childNodes) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const childEl = child
    if (
      (childEl.tagName === 'DIV' || childEl.tagName === 'P') &&
      isCaretOnlyBlock(childEl)
    ) {
      nested = walkCaretOnlyBlock(nested, childEl)
    }
  }
  if (nested.length > out.length) return nested
  return out + '\n'
}

function shouldSkipLeadingRootBlockBr(el, blockIndex) {
  if (blockIndex <= 0) return false
  if (!blockHasMeaningfulContent(el)) return false
  const first = el.firstChild
  if (!first || first.nodeName !== 'BR') return false
  for (let n = first.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType === Node.TEXT_NODE) {
      return stripEditorZwsp(n.textContent ?? '').length > 0
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      const child = n
      if (child.tagName === 'IMG' && child.dataset.memoEmoji) return false
      if (
        child.tagName === 'MARK' &&
        child.classList.contains('memo-body-highlight')
      ) {
        return false
      }
    }
  }
  return false
}

function memoBodyFromEditor(root) {
  let out = ''

  function walkInline(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += stripEditorZwsp(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node
    if (el.tagName === 'BR') {
      out += '\n'
      return
    }
    if (el.tagName === 'IMG' && el.dataset.memoEmoji) {
      out += memoEmojiToken(el.dataset.memoEmoji)
      return
    }
    if (
      el.tagName === 'MARK' &&
      el.classList.contains('memo-body-highlight')
    ) {
      return
    }
    for (const child of el.childNodes) walkInline(child)
  }

  function walkRootBlock(el, blockIndex) {
    if (isCaretOnlyBlock(el)) {
      out = walkCaretOnlyBlock(out, el)
      return
    }
    if (blockIndex > 0 && out.length > 0 && !out.endsWith('\n')) {
      out += '\n'
    }
    const skipLeadingBr = shouldSkipLeadingRootBlockBr(el, blockIndex)
    for (const child of el.childNodes) {
      if (skipLeadingBr && child === el.firstChild && child.nodeName === 'BR') {
        continue
      }
      walkInline(child)
    }
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += stripEditorZwsp(node.textContent ?? '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      for (const child of el.childNodes) walk(child)
    }
  }

  let rootBlockIndex = 0
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += stripEditorZwsp(child.textContent ?? '')
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child
    if (el.tagName === 'BR') {
      out += '\n'
      continue
    }
    if (el.tagName === 'IMG' && el.dataset.memoEmoji) {
      out += memoEmojiToken(el.dataset.memoEmoji)
      continue
    }
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      walk(el)
      continue
    }
    if (el.tagName === 'DIV' || el.tagName === 'P') {
      walkRootBlock(el, rootBlockIndex)
      rootBlockIndex += 1
      continue
    }
    walkInline(el)
  }

  return out
}

function test(name, html, expected) {
  const root = document.createElement('div')
  root.innerHTML = html
  const got = memoBodyFromEditor(root)
  const ok = got === expected
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}`)
  if (!ok) {
    console.log('  html:', html)
    console.log('  expected:', JSON.stringify(expected))
    console.log('  got:     ', JSON.stringify(got))
  }
}

test('two empty divs', '<div><br></div><div><br></div>', '\n\n')
test('one div two br', '<div><br><br></div>', '\n\n')
test('root br br', '<br><br>', '\n\n')
test('line1 + two empty divs', '<div>line1</div><div><br></div><div><br></div>', 'line1\n\n')
test('line1 br in same div + empty div', '<div>line1<br></div><div><br></div>', 'line1\n\n')
test('nested div br', '<div><div><br></div></div>', '\n')
test('div br + div img', '<div><br></div><div><img data-memo-emoji="start"></div>', '\n:m/start:')
test('div br br img same div', '<div><br><br><img data-memo-emoji="start"></div>', '\n\n:m/start:')
test('single br only', '<br>', '\n')
test('div single br', '<div><br></div>', '\n')
test('emoji after 2 empty divs', '<div><br></div><div><br></div><div><img data-memo-emoji="start"></div>', '\n\n:m/start:')
test('emoji with br preserved', '<div><br></div><div><br></div><div><br><img data-memo-emoji="start"></div>', '\n\n\n:m/start:')
test('emoji after line', '<div>hello</div><div><img data-memo-emoji="ok"></div>', 'hello\n:m/ok:')
test('type on line 2 after empty', '<div><br></div><div><br>a</div>', '\na')
test('type on line 3', '<div><br></div><div><br></div><div>a</div>', '\n\na')
test('single div br then text', '<div><br>a</div>', '\na')
