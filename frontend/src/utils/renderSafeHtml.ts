import DOMPurify from 'dompurify'

/**
 * 邮件 HTML 统一走这里：
 * 1) DOMPurify 白名单清洗
 * 2) 外链图片默认拦成占位图（防追踪像素），放行时再恢复
 * 3) 链接强制新窗口 + noopener
 * 渲染层再用 <iframe sandbox> 双重隔离，禁止任何 v-html 直出。
 */

const FORBID_TAGS = [
  'script',
  'noscript',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'link',
  'meta',
  'base',
  'template',
  'audio',
  'video',
  'source',
]

const FORBID_ATTR = ['srcset', 'formaction', 'ping', 'background', 'dynsrc', 'lowsrc']

const ALLOWED_ATTR = [
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'align',
  'valign',
  'style',
  'class',
  'id',
  'colspan',
  'rowspan',
  'cellpadding',
  'cellspacing',
  'border',
  'bgcolor',
  'color',
  'size',
  'face',
  'target',
  'rel',
  'dir',
  'lang',
  'role',
  'aria-label',
]

const TRANSPARENT_PIXEL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="none"/></svg>',
  )

export interface SanitizeResult {
  html: string
  blockedImages: number
}

const isRemote = (src: string): boolean => /^(https?:)?\/\//i.test(src.trim())

export function sanitizeEmailHtml(raw?: string | null, allowRemoteImages = false): SanitizeResult {
  if (!raw || !raw.trim()) return { html: '', blockedImages: 0 }

  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS,
    FORBID_ATTR,
    // 邮件里常见 <style>，但样式只在 sandbox iframe 内生效，风险可控
    ADD_TAGS: ['style'],
    ADD_ATTR: ['data-blocked-src'],
    KEEP_CONTENT: true,
  })

  const doc = new DOMParser().parseFromString(clean, 'text/html')
  let blockedImages = 0

  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (!src) {
      img.remove()
      return
    }
    if (isRemote(src)) {
      if (!allowRemoteImages) {
        blockedImages += 1
        img.setAttribute('data-blocked-src', src)
        img.setAttribute('src', TRANSPARENT_PIXEL)
        img.setAttribute('data-remote-blocked', '1')
      } else {
        img.setAttribute('referrerpolicy', 'no-referrer')
        img.setAttribute('loading', 'lazy')
      }
    }
  })

  doc.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') ?? ''
    if (/^javascript:/i.test(href)) {
      link.removeAttribute('href')
      return
    }
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer nofollow')
  })

  return { html: doc.body.innerHTML, blockedImages }
}

/** 纯文本邮件按段落转义渲染 */
export function textToHtml(text?: string | null): string {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<div style="white-space:pre-wrap;word-break:break-word;font-family:inherit;line-height:1.7">${escaped}</div>`
}

/** 阅读区 iframe 的文档壳：统一字体、行高、深浅色、表格自适应 */
export function buildIframeDoc(bodyHtml: string, dark: boolean): string {
  const bg = dark ? '#151a22' : '#ffffff'
  const fg = dark ? '#e6eaf2' : '#0f1520'
  const link = dark ? '#93a8ff' : '#2f5bea'
  const quoteBorder = dark ? '#35404f' : '#e3e7ee'

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_blank">
<style>
  html,body{margin:0;padding:0;background:${bg};color:${fg};}
  body{font-family:"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Source Han Sans SC","Noto Sans SC","Segoe UI",system-ui,sans-serif;
       font-size:14px;line-height:1.72;padding:4px 2px 12px;word-break:break-word;overflow-wrap:anywhere;}
  a{color:${link};text-decoration:none;} a:hover{text-decoration:underline;}
  img{max-width:100%;height:auto;}
  table{max-width:100%;border-collapse:collapse;}
  td,th{padding:2px 6px;vertical-align:top;}
  blockquote{margin:8px 0;padding:2px 0 2px 12px;border-left:3px solid ${quoteBorder};color:${dark ? '#a7b0bd' : '#5a6474'};}
  pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;background:${dark ? '#0e1116' : '#f2f4f8'};border-radius:6px;}
  pre{padding:10px;overflow:auto;}
  hr{border:none;border-top:1px solid ${quoteBorder};margin:14px 0;}
  h1,h2,h3{line-height:1.35;}
</style></head><body>${bodyHtml}</body></html>`
}
