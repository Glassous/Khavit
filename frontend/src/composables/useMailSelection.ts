import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useMailStore } from '../stores/mail'
import { useConfirm } from './useConfirm'
import { useToast } from './useToast'

/**
 * 邮件多选状态：模块级单例。
 *
 * 列表（点头像 / 长按翻牌选中）与顶栏（已选数量、批量操作按钮）共享同一份状态，
 * 桌面端列表内的批量条也复用这里的操作，避免两套删除/已读逻辑。
 */
const selected = ref<Set<string>>(new Set())

export function useMailSelection() {
  const mail = useMailStore()
  const auth = useAuthStore()
  const toast = useToast()
  const { confirm } = useConfirm()

  const count = computed(() => selected.value.size)
  const ids = computed(() => [...selected.value])
  /** 是否处于多选态（用于切换顶栏形态） */
  const active = computed(() => selected.value.size > 0)
  const checkedAll = computed(
    () => mail.emails.length > 0 && mail.emails.every((item) => selected.value.has(item.id)),
  )

  function isSelected(id: string): boolean {
    return selected.value.has(id)
  }

  function toggle(id: string): void {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
  }

  function clear(): void {
    if (selected.value.size > 0) selected.value = new Set()
  }

  function toggleAll(): void {
    selected.value = checkedAll.value ? new Set() : new Set(mail.emails.map((item) => item.id))
  }

  async function markRead(): Promise<void> {
    const list = [...selected.value]
    if (list.length === 0) return
    await mail.bulkRead(list, true)
    clear()
    toast.success(`已将 ${list.length} 封标记为已读`)
  }

  async function removeSelected(): Promise<void> {
    const list = [...selected.value]
    if (list.length === 0) return
    const ok = await confirm({
      title: `删除 ${list.length} 封邮件？`,
      description: '在收件箱中删除会移入回收站；在回收站中删除则永久清除，无法恢复。',
      confirmLabel: '删除',
      tone: 'danger',
    })
    if (!ok) return

    const trash = auth.mailboxByRole('trash')
    const inTrash = Boolean(trash && mail.currentMailboxId === trash.id)

    // remove() 内部按所在文件夹决定「移入回收站」还是「永久删除」
    for (const id of list) {
      await mail.remove(id)
    }
    clear()
    toast.success(inTrash ? '已永久删除' : '已移入回收站')
  }

  return {
    selected,
    count,
    ids,
    active,
    checkedAll,
    isSelected,
    toggle,
    toggleAll,
    clear,
    markRead,
    removeSelected,
  }
}
