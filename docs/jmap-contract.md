# JMAP 契约（实测于 Stalwart v1.0.3）

本文所有结构均来自本地真实实例的抓包结果，不是照 RFC 推测。复现方式见 `tools/jmap-probe`。

## 1. 端点与认证

| 项 | 值 |
|---|---|
| Session 发现 | `GET /.well-known/jmap`（也接受 `GET /jmap/session`） |
| API | `POST /jmap/` |
| 上传 | `POST /jmap/upload/{accountId}/` |
| 下载 | `GET /jmap/download/{accountId}/{blobId}/{name}?accept={type}` |
| 事件流 | `GET /jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}` |
| 认证 | `Authorization: Basic base64(email:password)` |

管理 API 与邮件 API **同一个端点**，区别只在 `using` 数组与账号权限。

## 2. Session 响应要点

实测字段（截取）：

```json
{
  "capabilities": {
    "urn:ietf:params:jmap:core": { "maxCallsInRequest": 16, "maxSizeUpload": 50000000, "maxObjectsInGet": 500 },
    "urn:ietf:params:jmap:mail": {},
    "urn:ietf:params:jmap:submission": {},
    "urn:ietf:params:jmap:vacationresponse": {},
    "urn:ietf:params:jmap:sieve": { "implementation": "Stalwart v1.0.0" },
    "urn:ietf:params:jmap:quota": {},
    "urn:ietf:params:jmap:websocket": { "url": "ws/jmap/ws", "supportsPush": true },
    "urn:ietf:params:jmap:blob": {},
    "urn:ietf:params:jmap:metadata": {}
  },
  "accounts": { "b": { "name": "admin", "isPersonal": true, "accountCapabilities": { "urn:stalwart:jmap": {}, "...": {} } } },
  "primaryAccounts": { "urn:ietf:params:jmap:mail": "b", "urn:ietf:params:jmap:submission": "b", "urn:stalwart:jmap": "b" },
  "username": "admin",
  "apiUrl": "https://mail.example.com/jmap/",
  "uploadUrl": "https://mail.example.com/jmap/upload/{accountId}/",
  "downloadUrl": "https://mail.example.com/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
  "eventSourceUrl": "https://mail.example.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
  "state": "34afffb5"
}
```

### 必须注意的三点

1. **`urn:stalwart:jmap` 挂在 `accountCapabilities`，不在 `capabilities`**。判断是否有管理能力要读 `accounts[accountId].accountCapabilities`。
2. **`apiUrl` 是用 Stalwart 自己的 `defaultHostname` 拼出来的绝对 URL**，不包含反代端口。本地把 443 映射到 8443 时，session 里仍是 `https://localhost/jmap/`，直接用会连不上。
   → 前端一律走**同源相对路径** `/jmap/`（生产同源反代时与 session 一致），开发期由 Vite proxy 转发。
3. `primaryAccounts` 是 `capability -> accountId` 的映射，`accountId` 是短 ID（如 `b`），不要硬编码。

## 3. Mailbox/get

默认 5 个系统文件夹，`role` 取值实测为：

| role | name | 说明 |
|---|---|---|
| `inbox` | Inbox | |
| `drafts` | Drafts | |
| `sent` | Sent Items | |
| `junk` | Junk Mail | |
| `trash` | Deleted Items | |

字段：

```json
{
  "id": "a", "name": "Inbox", "parentId": null, "role": "inbox", "sortOrder": 0,
  "isSubscribed": true,
  "totalEmails": 1, "unreadEmails": 1, "totalThreads": 1, "unreadThreads": 1,
  "myRights": { "mayReadItems": true, "mayAddItems": true, "mayRemoveItems": true, "maySetSeen": true,
                "maySetKeywords": true, "mayCreateChild": true, "mayRename": true,
                "maySubmit": true, "mayDelete": true, "mayShare": true, "maySetMetadata": true }
}
```

前端侧栏的未读徽标用 `unreadEmails` / `unreadThreads`，容量条不用 Mailbox，见第 8 节。

## 4. Email/query

```json
["Email/query", {
  "accountId": "b",
  "filter": { "inMailbox": "a" },
  "sort": [{ "property": "receivedAt", "isAscending": false }],
  "limit": 50,
  "position": 0
}, "q"]
```

实测响应：

```json
{ "accountId": "b", "queryState": "saq", "canCalculateChanges": true, "position": 0, "ids": ["eaaaaac"] }
```

- **不返回 `total`**，需要总数时加 `"calculateTotal": true`。
- 可用 `sort` 属性（来自 `accountCapabilities`）：`receivedAt`、`size`、`from`、`to`、`subject`、`sentAt`、`hasKeyword`、`allInThreadHaveKeyword`、`someInThreadHaveKeyword`。
- 常用 filter：`inMailbox`、`inMailboxOtherThan`、`text`、`from`、`to`、`subject`、`body`、`before`、`after`、`hasKeyword`、`notKeyword`、`minSize`、`maxSize`。

## 5. Email/get

实测返回（一封 multipart/alternative 邮件）：

```json
{
  "id": "eaaaaac",
  "blobId": "cbwqirdg...",
  "threadId": "b",
  "mailboxIds": { "a": true },
  "keywords": { "$hasnoattachment": true },
  "from": [{ "name": "Postmaster", "email": "admin@example.test" }],
  "to": [{ "name": "Postmaster", "email": "admin@example.test" }],
  "cc": null,
  "subject": "JMAP 契约自测",
  "sentAt": "2026-11-07T05:24:10Z",
  "receivedAt": "2026-11-07T05:24:10Z",
  "size": 1001,
  "preview": "这是通过 JMAP 直接投递的测试正文…",
  "hasAttachment": false,
  "messageId": ["18e5abea7489a428...@localhost"],
  "inReplyTo": null,
  "references": null,
  "bodyStructure": {
    "partId": null, "blobId": null, "size": 533, "type": "multipart/alternative",
    "subParts": [
      { "partId": "1", "blobId": "cnwqirdg...", "type": "text/plain", "charset": "utf-8", "size": 97 },
      { "partId": "2", "blobId": "cnwqirdg...", "type": "text/html", "charset": "utf-8", "size": 51 }
    ]
  },
  "bodyValues": {
    "1": { "isEncodingProblem": false, "isTruncated": false, "value": "这是正文…" },
    "2": { "isEncodingProblem": false, "isTruncated": false, "value": "<p>这是 <strong>HTML</strong> 正文测试。</p>" }
  },
  "attachments": []
}
```

要点：

- `bodyValues` 的 key 是 `partId`，取正文要先 `fetchTextBodyValues` / `fetchHTMLBodyValues: true`。
- `keywords` 里会出现系统关键字（实测 `$hasnoattachment`），前端关键字白名单必须保留未知 key，否则会误删。
- `attachments` 每项含 `partId`、`blobId`、`type`、`name`、`size`、`disposition`、`cid`；下载走 `downloadUrl` 模板。
- 列表页 `properties` 只取必要的字段，正文留给打开时再取，列表请求不要带 `fetchTextBodyValues`。

## 6. 写信与提交（实测可用）

### 6.1 建草稿（Email/set）

```json
["Email/set", {
  "accountId": "b",
  "create": {
    "d1": {
      "mailboxIds": { "d": true },
      "keywords": { "$draft": true, "$seen": true },
      "from": [{ "name": "Postmaster", "email": "admin@example.test" }],
      "to": [{ "name": "Postmaster", "email": "admin@example.test" }],
      "subject": "标题",
      "bodyValues": {
        "t1": { "value": "纯文本正文", "charset": "utf-8" },
        "h1": { "value": "<p>HTML 正文</p>", "charset": "utf-8" }
      },
      "textBody": [{ "partId": "t1", "type": "text/plain" }],
      "htmlBody": [{ "partId": "h1", "type": "text/html" }]
    }
  }
}, "es"]
```

返回 `created.d1 = { id, threadId, blobId, size }`。

### 6.1.1 两个实测踩过的坑

**（1）可选字段不能写 `null`。** 传 `"cc": null` / `"bcc": null` / `"inReplyTo": null` 会被拒：

```json
{ "draft": { "type": "invalidProperties", "description": "Invalid property or value.", "properties": ["cc"] } }
```

正确做法是**整个字段不存在**，而不是给 null 值。

**（2）Email 创建后不可变（除 `mailboxIds` / `keywords`）。** 直接 `update` 正文会返回 `notUpdated`，所以「编辑草稿」必须实现为：

```
create 新草稿（完整内容） → destroy 旧草稿
```

前端实现在 `jmap/submit.ts` 的 `saveDraft()`。发送成功后的「移出草稿箱 / 移入已发送」属于 `mailboxIds` + `keywords` 变更，可以用 `onSuccessUpdateEmail` 正常完成，不受此限制。

### 6.2 提交发信（EmailSubmission/set）

```json
["EmailSubmission/set", {
  "accountId": "b",
  "create": {
    "s1": {
      "emailId": "eaaaaab",
      "identityId": "b",
      "envelope": {
        "mailFrom": { "email": "admin@example.test", "parameters": null },
        "rcptTo": [{ "email": "admin@example.test", "parameters": null }]
      }
    }
  },
  "onSuccessUpdateEmail": {
    "#s1": {
      "mailboxIds/d": null,
      "mailboxIds/e": true,
      "keywords/$draft": null,
      "keywords/$seen": true
    }
  }
}, "ss"]
```

实测效果：`drafts` 归零、`sent` +1、同域收件人 `inbox` +1 且 `unreadEmails=1`。
`onSuccessUpdateEmail` 的 key 用 `#s1` 引用同一次调用里创建的 submission，值用 JMAP PatchObject 语法（`mailboxIds/<id>`、`keywords/<key>`）。

### 6.3 发信身份（Identity/get）

**`using` 必须包含 `urn:ietf:params:jmap:submission`**，否则报 `unknownMethod`：

```json
{ "type": "unknownMethod", "description": "Method Identity/get requires capability urn:ietf:params:jmap:submission which is not present in the \"using\" property." }
```

身份对象：

```json
{ "id": "b", "name": "System administrator", "email": "admin@example.test",
  "replyTo": null, "bcc": null, "textSignature": "", "htmlSignature": "", "mayDelete": true }
```

## 7. 附件上传

`uploadUrl` 是模板，替换 `{accountId}` 后 `POST` 原始字节流，请求头 `Content-Type: <mime>`，响应返回 `blobId` 等。把 `blobId` 写进 `Email/set` 的 `attachments[].blobId` 即可。前端实现见 `frontend/src/jmap/client.ts` 的 `upload()`。

## 8. 容量与配额（实测有坑）

`Quota/get` 在未给账号设置配额时返回 **空 list**：

```json
{ "accountId": "b", "state": "n", "list": [], "notFound": [] }
```

所以前端容量展示改为读 `x:Account/get` 的 `quotas.maxDiskQuota`（字节）与 `usedDiskQuota`（字节）；`Quota/get` 为空时直接隐藏容量条。

## 9. 管理 API（`using: [core, urn:stalwart:jmap]`）

### 9.1 可用的对象方法

实测可用：`x:Domain/*`、`x:Account/*`、`x:Tenant/*`、`x:Tracer/*`、`x:SpamClassifier/get`、`x:SearchStore/get`、`x:DataStore/get`、`x:BlobStore/get`、`x:InMemoryStore/get`、`x:SystemSettings/get`、`x:Certificate/get`、`x:AcmeProvider/get`。

不存在的对象名会返回 `unknownMethod`（实测 `x:SpamFilter/get`、`x:DnsBlocklist/get`、`x:Listener/get` 均不存在，别照旧版 REST 的命名猜）。

### 9.2 Domain

```json
{
  "name": "example.com",
  "aliases": {},
  "enable": true,
  "createdAt": "2026-11-07T05:21:46Z",
  "description": null,
  "certificateManagement": { "@type": "Manual" },
  "dkimManagement": { "@type": "Manual" },
  "dnsManagement": { "@type": "Manual" },
  "catchAllAddress": null,
  "subAddressing": { "@type": "Enabled" },
  "allowRelaying": false,
  "reportAddressUri": "mailto:postmaster",
  "dnsZoneFile": "example.com. IN TXT \"v=spf1 mx -all\"\n...",
  "id": "b"
}
```

- 最小创建载荷只有 `name`，实测成功：`{"create":{"nd":{"name":"demo.test"}}}` → `created.nd.id = "c"`。
- `dnsZoneFile` 是服务端生成的完整 zone 文件（SPF/MX/DMARC/SRV/MTA-STS/TLS-RPT/autoconfig），**管理后台直接展示它给用户抄到 DNS**，不要自己拼字符串。
- `aliases` 是 Set，序列化为 `{}` 或数组；`certificateManagement` / `dkimManagement` / `dnsManagement` 都是 `{"@type": "Manual" | "Automatic"}` 判别对象。

### 9.3 Account（最容易踩坑）

字段：`name`（local part）、`domainId`、`emailAddress`（server-set）、`credentials`、`roles`、`permissions`、`quotas`、`aliases`、`memberGroupIds`、`description`、`locale`、`timeZone`、`encryptionAtRest`、`usedDiskQuota`（server-set）、`@type: "User"`。

**注意事项（全部实测）**：

1. `credentials` **必须是 map，key 为数字字符串**：
   - `[{"@type":"Password","secret":"..."}]` → `invalidPatch: Invalid value for object property`
   - `{"c0": {...}}` 或 `{"a": {...}}` → `invalidPatch: Invalid key for object property`
   - `{"1": {"@type":"Password","secret":"..."}}` → ✅ 通过
2. **密码有强度校验**（zxcvbn 风格）。`Test1234!` 返回：
   `invalidProperties: Password is too weak. This is similar to a commonly used password.` 前端要提示用户用长随机短语。
3. `aliases` 同样是 **map**（key 数字字符串），传 `[]` 会报 `Invalid value for object property`。
4. `quotas` 是 map<枚举名, 整数>，`maxDiskQuota` 单位为字节；其它键是数量上限（`maxEmails`、`maxMailboxes`、`maxEmailSubmissions`、`maxSieveScripts`、`maxAppPasswords`、`maxApiKeys` 等）。
5. 回读时 `credentials` 的 key 会被服务端重排（写入 `"1"`，读出 `"0"`），`secret` 返回 `****`，并多出 `credentialId`。**不要依赖 key 定位凭证**。
6. 改密码就是 update 整个 `credentials`（会替换列表），前端改密码时提示「会同时重置该账号的 App Password 索引」。

实测通过的最小建号载荷：

```json
["x:Account/set", {
  "create": {
    "u1": {
      "@type": "User",
      "name": "test1",
      "domainId": "b",
      "credentials": { "1": { "@type": "Password", "secret": "Kq7#vLm2Zt9wRx4D" } },
      "roles": { "@type": "User" },
      "quotas": { "maxDiskQuota": 1073741824, "maxEmails": 10000 },
      "aliases": {},
      "description": "描述",
      "locale": "zh-CN",
      "timeZone": "Asia/Shanghai"
    }
  }
}, "a1"]
```

改密码 + 改配额：

```json
["x:Account/set", {
  "update": { "c": { "credentials": { "1": { "@type": "Password", "secret": "Nw8$bHk3Yq6vTz1P" } }, "quotas": { "maxDiskQuota": 2147483648 } } }
}, "a3"]
```

加别名：

```json
["x:Account/set", {
  "update": { "c": { "aliases": { "1": { "enable": true, "name": "contact", "domainId": "b", "description": "联系我" } } } }
}, "a5"]
```

删除：`{"destroy": ["c"]}` → `{"destroyed": ["c"]}`。删除后该账号邮件一并清理。

## 10. Bootstrap 与 Tracer（部署相关）

- `x:Bootstrap/get` / `set` **只在 bootstrap 模式（首次启动、无 config.json）可用**。完成后 get 返回 `notFound: ["singleton"]`，set 返回 `forbidden: This operation is only allowed in bootstrap mode`。
  → 初始化配置（hostname/域名/存储/DNS）必须在 setup 阶段一次定好，或改用对应独立对象（`x:Tracer/set`、`x:Domain/set` 等）。
- Tracer 默认是 `Log` + `path: /var/log/stalwart/`，**容器里没有这个目录，结果是 `docker logs` 看不到任何运行日志**（实测：重启后日志停留在旧内容）。改成 stdout：

```json
["x:Tracer/set", {
  "update": { "<tracerId>": {
    "@type": "Stdout", "buffered": true, "ansi": false, "multiline": false,
    "enable": true, "level": "info", "lossy": false, "events": {}, "eventsPolicy": "exclude"
  } }
}, "u"]
```

  实测可直接把 `Log` 更新为 `Stdout`（`updated: {"<id>": null}`），改完重启即恢复日志输出。

## 11. 错误类型对照

| type | 含义 | 前端处理 |
|---|---|---|
| `invalidPatch` | 字段值/键名不合法（如 credentials 传数组） | 表单字段级报错 |
| `invalidProperties` | 字段值被拒（如密码强度不足） | 字段级报错，展示 `description` 原文 |
| `forbidden` | 权限不足（非管理员调用管理 API） | 提示无权限，隐藏管理入口 |
| `unknownMethod` | 方法不存在或 `using` 缺能力（如 Identity/get 缺 submission） | 开发期错误，检查 `using` |
| `notRequest` | 请求体不是合法 JMAP（常见于 JSON 被截断） | 重试前先校验序列化 |
