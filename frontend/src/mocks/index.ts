/**
 * 本地模拟数据的入口。只通过 `await import('../mocks')` 动态加载，
 * 生产构建里 `import.meta.env.DEV` 为 false，这条动态导入会被完整移除。
 */
import type { Id, JmapResponse, JmapSession, MethodCall, UploadResult } from '../jmap/types'

type MockServer = typeof import('./mockServer')

/** 登录页的提示文案也放在 mock 模块里，生产构建连这句话都不会留下 */
export const MOCK_HINT =
  '本地演示模式：任意邮箱 + 任意密码即可登录。邮件与账号都是浏览器里的模拟数据，不会请求后端。'

let server: MockServer | null = null
let pending: Promise<MockServer> | null = null

async function load(): Promise<MockServer> {
  if (server) return server
  if (!pending) {
    pending = import('./mockServer').then((mod) => {
      server = mod
      // 控制台里可以 __resetMockData() 恢复演示数据
      ;(window as unknown as Record<string, unknown>).__resetMockData = () => {
        mod.reset()
        window.location.reload()
      }
      return mod
    })
  }
  return pending
}

export async function mockSession(username: string): Promise<JmapSession> {
  return (await load()).session(username)
}

export async function mockCall(username: string, calls: MethodCall[]): Promise<JmapResponse> {
  return (await load()).handle(username, calls)
}

export async function mockUpload(file: File, accountId: Id): Promise<UploadResult> {
  return (await load()).upload(file, accountId)
}

export async function mockDownload(blobId: Id, name: string, type: string): Promise<Blob> {
  return (await load()).download(blobId, name, type)
}
