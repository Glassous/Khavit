# DNS 与投递率

## 1. 直接抄 Stalwart 生成的 zone 文件

建好域名后，`x:Domain/get` 的 `dnsZoneFile` 字段就是服务端生成的完整记录集，**以它为准**，不用手拼。实测 `example.test` 的输出（把 `localhost` 换成 `mail.example.com`、把域名换成你的）：

```
example.com.                IN TXT  "v=spf1 mx -all"
example.com.                IN MX   10 mail.example.com.
_dmarc.example.com.         IN TXT  "v=DMARC1; p=reject; rua=mailto:postmaster@example.com"
_caldavs._tcp.example.com.  IN SRV  0 1 443 mail.example.com.
_carddavs._tcp.example.com. IN SRV  0 1 443 mail.example.com.
_imaps._tcp.example.com.    IN SRV  0 1 993 mail.example.com.
_jmap._tcp.example.com.     IN SRV  0 1 443 mail.example.com.
_pop3s._tcp.example.com.    IN SRV  0 1 995 mail.example.com.
_submissions._tcp.example.com. IN SRV 0 1 465 mail.example.com.
mta-sts.example.com.        IN CNAME mail.example.com.
_mta-sts.example.com.       IN TXT  "v=STSv1; id=<自动生成>"
_smtp._tls.example.com.     IN TXT  "v=TLSRPTv1; rua=mailto:postmaster@example.com"
ua-auto-config.example.com. IN CNAME mail.example.com.
_ua-auto-config.example.com. IN TXT "v=UAAC1; a=sha256; d=<自动生成>"
autoconfig.example.com.     IN CNAME mail.example.com.
autodiscover.example.com.   IN CNAME mail.example.com.
```

管理后台的「域名」页面会把这个文件直接展示出来，配一个复制按钮即可。
例外是 SPF：如果出站走中继（第 4 节），Stalwart 生成的 `v=spf1 mx -all` 不含中继商的 `include`，要手工合并。

## 2. 最小可用集（只求能收发）

| 记录 | 值 | 作用 |
|---|---|---|
| `A  mail.example.com` | 服务器公网 IP | 所有协议入口 |
| `MX example.com` | `10 mail.example.com.` | 收信路由 |
| `TXT example.com` | `v=spf1 mx -all` | 声明合法发信源 |
| `TXT <selector>._domainkey.example.com` | 建域时自动生成 | DKIM 签名公钥 |
| `TXT _dmarc.example.com` | `v=DMARC1; p=none; rua=mailto:postmaster@example.com` | 先 `p=none` 观察，稳定后再改 `quarantine`/`reject` |
| `PTR`（反向解析） | `mail.example.com` | **在云厂商控制台设置**，不是 DNS 记录，缺了几乎必进垃圾箱 |

DKIM 选择器（selector）在 `x:Domain/get` 的 `dkimManagement` 里，或用管理 API 读 DKIM 记录；默认模板形如 `v1-rsa-sha256-<日期>`。

> 若 25 出站被封、改走中继（第 4 节），这张表只增不改：SPF 仍只有一条、把
> `include:qcloudmail.com` 与 `mx` 并列；再补一条中继商给的 DKIM TXT（如 `qcloudgz2048._domainkey`）；
> MX / DMARC / PTR 保持原样。

## 3. 顺序建议

1. 先只配 A + MX + SPF，确认能收信
2. 再配 DKIM + DMARC（`p=none`），用 `postmaster@` 发一封到 Gmail 看「原始邮件」里 `dkim=pass`、`spf=pass`
   （25 出站被封时这一步要先配完第 4 节的中继，否则永远等不到 pass）
3. 三周无异常后，DMARC 改 `p=quarantine`，再改 `p=reject`
4. 最后加 MTA-STS / TLS-RPT / SRV / autoconfig（只为客户端自动配置体验，不影响能否收发）

## 4. 25 出站被封：改走腾讯云 SES 中继（465）

国内云厂商（阿里云、腾讯云、华为云等）默认封禁**出站 25**，表现为：

- 能收外部邮件（入站 25 通常放行，或至少 465/993 可用）
- 能发同域邮件（内部直投，实测验证）
- 发外部域时队列积压，日志出现 `deferred`、`connection refused`、`timed out`

腾讯云对「解封 25」的常见答复是不予放行，只建议「保留实例收信、出站改第三方 SMTP 中继、走 465 发信」。
本节就是那条路的完整落地步骤（以腾讯云邮件推送 SES 为例）。

> ⚠️ 别把两个 465 搞混：compose 里映射的 `465` 是「邮件客户端 → 本机 Stalwart」的提交端口，**必须保留**；
> 本节配的 465 是「本机 Stalwart → 腾讯云 SES」的出站中继端口，纯出站，不需要任何端口映射。

### 4.1 先确认症状

```bash
# 出站 25 是否可达
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "25 通" || echo "25 被封"
# 出站 465 是否可达（中继要走的路）
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/smtp.qcloudmail.com/465' && echo "465 通" || echo "465 不通"
```

### 4.2 开工前先过这道闸：账号还能不能用 SMTP

腾讯云官方规定：**2026-03-02 零点后开通邮件推送的个人认证用户不再支持 SMTP 发信**
（需升级企业认证，或只能用 API / 控制台发信）。自建邮局发信只能走 SMTP——Stalwart 不会去调腾讯云 API，
所以这条不满足，整个方案就不成立。

确认方法：控制台 → 邮件配置 → **发信地址** → 目标地址的操作栏里，是否有「设置 SMTP 密码」。

- 有 → 继续往下
- 没有 → 直接看 4.11 的退路，或先把账号升级为企业认证

### 4.3 控制台验证发信域名（四条 DNS 记录）

| 用途 | 主机记录（主域 `example.com`） | 类型 | 记录值 |
|---|---|---|---|
| MX | `@` | MX | `mail.example.com.` —— **有自建邮局就填自己的**，不要填 `mxbiz1.qq.com.`；末尾保留 `.` |
| SPF | `@` | TXT | `v=spf1 include:qcloudmail.com mx -all` |
| DKIM | `qcloudgz2048._domainkey`（广州）/ `qcloudhk2048._domainkey`（香港） | **TXT** | 控制台「验证」弹窗给出的整串公钥 |
| DMARC | `_dmarc` | TXT | 保持现有记录（`v=DMARC1; p=none; rua=...`），不要为 SES 重写 |

要点：

- 控制台验证只检查「记录里有没有它要的东西」：SPF 必须含 `include:qcloudmail.com`。若上面的写法过不了验证，
  先按控制台给的 `v=spf1 include:qcloudmail.com ~all` 提交，通过后再把 `~all` 改回 `-all`
  （`all` 机制只影响接收方判定，不影响验证）。
- **全域名只能有一条 SPF**：原来的 `v=spf1 mx -all` 要合并进这一条，不能并列两条 TXT。
- **DKIM 是 TXT 不是 CNAME**；1024 / 2048 位可并存，2023-07-06 之前建的域名旧命名是 `qcloud._domainkey`。
- 子域名发信时所有主机记录追加子域，例如 `_dmarc.abc`、`qcloudgz2048._domainkey.abc`。
- **原有的 Stalwart DKIM 记录不要删**：中继场景下会有两套签名（自己的 + 腾讯云的），DMARC 只要任意一条 DKIM 对齐就通过，双签名更稳。
- DNS 生效需 5 分钟～2 小时；每个账号最多 10 个发信域名。

### 4.4 建发信地址，拿 SMTP 凭据

1. 控制台 → 邮件配置 → **发信地址** → 新建：选已验证的发信域名，填邮箱前缀与发件人别名（如 `no-reply@example.com`）
2. 在该地址的操作栏点「设置 SMTP 密码」，单独设一个强口令
3. 建议同时开启「SMTP 密码 + 访问 IP 白名单」双因子并绑定本机公网 IP——中继凭据泄露等于别人能借你的域名发信

凭据口径（最容易填错的地方）：

| 字段 | 值 |
|---|---|
| 主机 | `smtp.qcloudmail.com`（广州用 `gz-smtp.qcloudmail.com`，国际站用 `sg-smtp.qcloudmail.com`） |
| 端口 | `465`（SSL 隐式 TLS）；`587` 为 STARTTLS |
| 用户名 | 发信地址本身，如 `no-reply@example.com` |
| 密码 | 上一步为该地址设的 SMTP 密码，**不是**腾讯云登录密码，也**不是** API SecretKey |

配额：每个域名最多 10 个发信地址，多账号邮局需要逐个登记（见 4.9 的 553 一行）。

### 4.5 在 Stalwart 里建中继路由

先明确一件事：**Stalwart v1 的配置对象存在 data store（本项目是 RocksDB）里**，
`data/etc/config.json` 只保存 `{"@type":"RocksDb","path":"/var/lib/stalwart/"}` 这类存储位置，
改它加不了中继；入口只有 WebUI、`stalwart-cli`、`x:` API 三种，底层都是 JMAP。

WebUI：**Settings › MTA › Outbound › Routes** → 新建 → 类型选 **Relay**：

| 字段 | 值 |
|---|---|
| host | `smtp.qcloudmail.com` |
| port | `465` |
| protocol | `smtp` |
| implicitTls | **开**（465 是连上即 TLS，不是 STARTTLS） |
| allowInvalidCerts | 关 |
| authUsername | `no-reply@example.com` |
| authSecret | 类型 `Value`，值填 SMTP 密码 |
| description | `tencent-ses`（表达式要靠这个名字引用路由，别填成带空格的中文名） |

`name` 是只读字段，由系统生成，不要提交——**以建好后列表里实际显示的 `name` 为准**，
下文表达式里的 `tencent-ses` 只是示例。等价的 JMAP 对象（`POST /jmap/` 的 `x:MtaRoute/set`，
`using` 带 `urn:ietf:params:jmap:core` 与 `urn:stalwart:jmap`）：

```json
{"@type":"Relay","description":"tencent-ses","host":"smtp.qcloudmail.com","port":465,
 "protocol":"smtp","implicitTls":true,"allowInvalidCerts":false,
 "authUsername":"no-reply@example.com",
 "authSecret":{"@type":"Value","secret":"<SMTP 密码>"}}
```

Relay 变体**没有** `maxMxHosts` / `maxMultihomed` / `ipLookupStrategy` 这些字段（那是 MX 路由的）。

### 4.6 把出站策略指向中继

WebUI：**Settings › MTA › Outbound › Strategy** → `route` 字段。

默认是「本地域 `local`，其余 `mx`（查对方 MX 直投）」。改成：

```json
{"route": {"match": {"0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"}}, "else": "'tencent-ses'"}}
```

含义：收件人在本地域 → 投本地信箱（同域邮件不出网、不受 25 影响）；其余全部交给 `tencent-ses`。

注意：

- 表达式返回的是**路由名字**，必须与路由列表里显示的 `name` 逐字一致（下面用 `tencent-ses` 举例），不是内联参数。
- 名字对不上**不会报错**，只打 `smtp.id-not-found` 警告并回退成 MX 直投——症状看起来像「配了没反应」。
- 第一个分支必须保留，否则本域邮件也会被送去外部中继绕一圈。
- 若只想让客户端提交的邮件走中继（服务器自发通知仍直投），用端口条件：

```json
{"route": {"match": {"0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"}, "1": {"if": "received_via_port == 587", "then": "'tencent-ses'"}}, "else": "'mx'"}}
```

### 4.7 重载才生效

MTA 规则与表达式属于「重载后生效」类，**保存对象不会立即生效**：

- WebUI：**Management › Actions › ReloadSettings**
- CLI：`stalwart-cli create Action/ReloadSettings`
- 兜底：`make restart`（等效，但会断当前连接，更重）

重载是安全的：配置有错时不会替换正在运行的配置，错误从 `notCreated` 返回。

TLS 策略保持默认 `default`（STARTTLS 可选、校验证书）。两个坑：

- 若把 TLS 策略设成 `dane: require`，中继**永远投不出去**（中继不是收件域的 MX，没有 DANE 记录）；中继链路也不查 MTA-STS。
- 默认 `tls` 表达式在「上次因证书失败」后会选中 `invalid-tls`，该策略**不校验证书**。
  若中继首次 TLS 失败后又「自己好了」，就是落到了这条路径，应把中继固定到校验证书的策略。

### 4.8 验收

```bash
# 1) 465 可达（只证 TCP，不证 TLS）
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/smtp.qcloudmail.com/465' && echo "465 通"

# 2) 发一封自测信（From 用发信地址），同时跟日志
docker compose logs -f stalwart | grep -Ei 'relay|smtp|queue|id-not-found'
```

判定标准：

1. 队列清空，日志里发往中继的会话以 `250` 结束，且没有 `smtp.id-not-found`
2. Gmail 收到后「显示原始邮件」→ `Authentication-Results` 里 `spf=pass`、`dkim=pass`、`dmarc=pass`
   （双签名会有多条 DKIM，至少自己域那条要 pass）
3. 反向验证：从外部域回信能进收件箱（证明入站 25 未受影响）

积压的老邮件会按调度曲线自动重试（2、5、10、15、30 分钟，1 小时，之后每 2 小时；1 天 / 3 天发延迟通知；
**5 天后过期**）。超过 5 天的失败邮件不会自己复活，只能重发。

### 4.9 排错对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `535 Authentication failed` | 用户名不是发信地址；或密码用了登录密码 / SecretKey；或该地址没设 SMTP 密码 | 回 4.4 重设，确认登录名与「发信地址」逐字一致 |
| `553 Mail from must equal authorized user` / `554` | 腾讯云要求 envelope 发件人等于认证的发信地址（官方 SMTP 指南未写明，**需实测**） | 为每个在用地址建发信地址（每域 10 个上限）；不够就换中继 |
| 日志 `smtp.id-not-found` | 表达式里的路由名与路由对象名字不一致，或路由没建成 | 用 `x:MtaRoute/query`（filter 只支持 `name`）或 WebUI 列表核对，改完重载 |
| 队列仍 `deferred`，日志在连 gmail/qq 的 MX | 没重载；或表达式第一个分支把远程域也匹配成了 `local` | 执行 ReloadSettings，核对表达式 |
| 465 连不通 | 本机出站 465 被拦（少见）、DNS 解析失败 | 换 `gz-smtp.qcloudmail.com` 试；确认机器能出网 |
| 中继一直 `dane` 失败 | TLS 策略要求 DANE | 改回 `default` 策略 |
| 给同一个收件人发不出去 | SES 限流：同一发信人 → 同一收件人 10 封/小时 | 等窗口过去，别对同一地址连发 |
| 5 天后集体过期 | 队列过期时间 | 先修配置，再手动重发 |

> 想自测「From 是否必须等于发信地址」：用 A 地址认证、把 From 写成同域 B 地址发一封。
> 收到即说明腾讯云 SES 允许域内任意 From；被 553/554 拒绝就只能逐个建发信地址。

### 4.10 配额与限流

- SMTP：同一 appId **20 封/秒**；同一发信人 → 同一收件人 **10 封/小时**
- 每账号最多 **10 个发信域名**，每域名最多 **10 个发信地址**
- 个人域日常用量远低于阈值，但「给同一个人连发多封」很容易撞上限流

### 4.11 走不通时的退路

1. **升级企业认证**，恢复 SES 的 SMTP 发信权限（最省事）
2. **换境外中继**：Resend（`smtp.resend.com:465`）、Mailgun（`smtp.mailgun.org:465`）、Postmark、AWS SES。
   Stalwart 侧只改 host / 用户名 / 密码，路由名与表达式不用动
3. **自建境外中转机**：在不封 25 的 VPS 上跑一个只做转发的 SMTP，本机把它当中继。只解决出站，收信仍在本机
4. **阿里云邮件推送**：可行但更严格——它按「地址级」验证，From 必须等于控制台登记的发信地址，多账号更容易撞 553

> 中继凭据不写进 compose，也不进版本库：它是运行时配置，存在 Stalwart 的 data store 里。
> `.env.example` 只留 `SMTP_RELAY_*` 作字段记录位，容器不读取这些变量。

## 5. 进箱率检查清单

- [ ] `PTR` 指向 `mail.example.com`，且 `mail.example.com` 的 A 记录指回同一 IP（正反一致）——直投时必须；走中继后对方看到的是中继商的 IP，这条只影响入站与退信判定
- [ ] `HELO` 名与 PTR 一致（Stalwart 用 `defaultHostname`，所以 hostname 必须是 `mail.example.com`）
- [ ] SPF 只有一条 `v=spf1`，无语法错误，`-all` 结尾；走中继时含 `include:qcloudmail.com` 且保留 `mx`
- [ ] DKIM 测试通过（Gmail 原文 → `dkim=pass`）；走中继时自己的签名与中继商的签名可以并存，只要有一条对齐即可
- [ ] DMARC 有记录且 `rua` 可达
- [ ] 域名有网站内容（裸域能解析），新域名先少量发信养信誉
- [ ] 不发批量营销邮件（个人域一次群发就会被判垃圾）

## 6. 客户端自动配置

配好 `autoconfig` / `autodiscover` 的 CNAME 与 443 可达后，Thunderbird / Outlook 输入邮箱地址即可自动填充：

| 协议 | 主机 | 端口 | 加密 |
|---|---|---|---|
| IMAP | mail.example.com | 993 | SSL/TLS |
| SMTP | mail.example.com | 465 | SSL/TLS |
| SMTP（STARTTLS） | mail.example.com | 587 | STARTTLS |
| CalDAV | `https://mail.example.com/dav/cal/` | 443 | HTTPS |
| CardDAV | `https://mail.example.com/dav/card/` | 443 | HTTPS |

JMAP 客户端（如 Thunderbird 的 JMAP 支持）填 Session URL：`https://mail.example.com/.well-known/jmap`。

表里的 465 是「客户端 → 本机」的提交端口，和第 4 节「本机 → 中继」的出站 465 是两件事。
