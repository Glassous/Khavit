type ClassValue = string | number | null | false | undefined | ClassValue[]

/** 极简 className 合并：过滤空值并展平数组 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  const walk = (value: ClassValue): void => {
    if (!value) return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    out.push(String(value))
  }
  values.forEach(walk)
  return out.join(' ')
}
