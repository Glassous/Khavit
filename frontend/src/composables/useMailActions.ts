import { useMailStore } from '../stores/mail'
import { useConfirm } from './useConfirm'
import { useToast } from './useToast'
import { useMailExpand } from './useMailExpand'

/**
 * 当前这封邮件的一组操作（星标 / 未读 / 归档 / 删除）。
 *
 * 响应式下这几个按钮在顶栏，桌面端在正文顶部的工具条，两处共用同一份实现，
 * 免得「顶栏删了邮件但没退回列表」这类差异。删除会先弹确认框。
 */
export function useMailActions() {
  const mail = useMailStore()
  const toast = useToast()
  const { confirm } = useConfirm()
  const { collapse } = useMailExpand()

  /**
   * 邮件已经不在了（删掉/归档/标记未读都会关掉当前邮件），
   * 展开的卡片直接消失，不做缩回动画。
   */
  function closeReader(): void {
    collapse()
  }

  function toggleStar(): void {
    const id = mail.selectedId
    if (!id) return
    void mail.setStarred(id, !mail.selectedEmail?.keywords?.$flagged)
  }

  async function markUnread(): Promise<void> {
    const id = mail.selectedId
    if (!id) return
    await mail.toggleRead(id, false)
    mail.closeEmail()
    closeReader()
    toast.success('已标记为未读')
  }

  async function archive(): Promise<void> {
    const id = mail.selectedId
    if (!id) return
    await mail.archive(id)
    closeReader()
    toast.success('已归档')
  }

  async function remove(): Promise<void> {
    const current = mail.selectedEmail
    if (!current) return
    const ok = await confirm({
      title: '删除这封邮件？',
      description: '在收件箱中删除会移入回收站，在回收站中删除则永久清除。',
      confirmLabel: '删除',
      tone: 'danger',
    })
    if (!ok) return

    const result = await mail.remove(current.id)
    closeReader()
    toast.action(result === 'moved' ? '已移入回收站' : '已永久删除', '撤销', () => {
      void mail.loadFirstPage()
    })
  }

  return { toggleStar, markUnread, archive, remove }
}
