import { ref } from 'vue'

/**
 * 响应式正文页的开关：列表（MailView）负责打开/关闭，
 * 顶栏读它决定现在是「列表态」还是「正文态」（返回键 + 邮件操作）。
 *
 * 模块级单例，与 useSidebar 同一套做法：邮件页与顶栏本来就在同一棵树里，
 * 传 props 反而绕远路。
 */
const reading = ref(false)

export function useMobileReader() {
  return { reading }
}
