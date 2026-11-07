import { describe, expect, it } from 'vitest'
import { buildIframeDoc, sanitizeEmailHtml, textToHtml } from '../utils/renderSafeHtml'

describe('sanitizeEmailHtml', () => {
  it('移除脚本、事件处理器与表单控件', () => {
    const raw =
      '<p onclick="alert(1)">hi</p><script>alert(2)</script><iframe src="x"></iframe><form><input name="p"></form>'
    const { html } = sanitizeEmailHtml(raw)

    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<input')
    expect(html).toContain('hi')
  })

  it('javascript: 链接被剥离 href', () => {
    const { html } = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click')
  })

  it('远程图片默认被替换为占位并计数', () => {
    const raw = '<img src="https://tracker.example.com/pixel.gif" alt="t">'
    const result = sanitizeEmailHtml(raw, false)

    expect(result.blockedImages).toBe(1)
    expect(result.html).toContain('data-blocked-src="https://tracker.example.com/pixel.gif"')
    expect(result.html).toContain('data:image/svg+xml')
  })

  it('放行后保留远程图片并加 no-referrer', () => {
    const raw = '<img src="https://cdn.example.com/a.png">'
    const result = sanitizeEmailHtml(raw, true)

    expect(result.blockedImages).toBe(0)
    expect(result.html).toContain('https://cdn.example.com/a.png')
    expect(result.html).toContain('referrerpolicy="no-referrer"')
  })

  it('内联 data 图片不受影响', () => {
    const raw = '<img src="data:image/png;base64,iVBORw0KGgo=">'
    const result = sanitizeEmailHtml(raw)
    expect(result.blockedImages).toBe(0)
    expect(result.html).toContain('data:image/png')
  })

  it('链接强制新窗口并加 rel', () => {
    const { html } = sanitizeEmailHtml('<a href="https://example.com">x</a>')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('noopener')
  })

  it('空输入返回空结果', () => {
    expect(sanitizeEmailHtml('')).toEqual({ html: '', blockedImages: 0 })
    expect(sanitizeEmailHtml(null)).toEqual({ html: '', blockedImages: 0 })
  })
})

describe('textToHtml', () => {
  it('转义 HTML 并保留换行', () => {
    const html = textToHtml('<b>a</b>\nb')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('white-space:pre-wrap')
  })
})

describe('buildIframeDoc', () => {
  it('深色与浅色使用不同背景', () => {
    expect(buildIframeDoc('<p>x</p>', true)).toContain('#151a22')
    expect(buildIframeDoc('<p>x</p>', false)).toContain('#ffffff')
  })

  it('包含 viewport 与 base target', () => {
    const doc = buildIframeDoc('<p>x</p>', false)
    expect(doc).toContain('name="viewport"')
    expect(doc).toContain('<base target="_blank">')
  })
})
