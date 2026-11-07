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

## 3. 顺序建议

1. 先只配 A + MX + SPF，确认能收信
2. 再配 DKIM + DMARC（`p=none`），用 `postmaster@` 发一封到 Gmail 看「原始邮件」里 `dkim=pass`、`spf=pass`
3. 三周无异常后，DMARC 改 `p=quarantine`，再改 `p=reject`
4. 最后加 MTA-STS / TLS-RPT / SRV / autoconfig（只为客户端自动配置体验，不影响能否收发）

## 4. 25 端口被封怎么办

国内云厂商（阿里云、腾讯云、华为云等）默认封禁**出站 25**，表现为：

- 能收外部邮件（入站 25 通常放行，或至少 465/993 可用）
- 能发同域邮件（内部直投，实测验证）
- 发外部域时队列积压，日志出现 `deferred`、`connection refused`、`timed out`

判断方法：

```bash
# 在服务器上测出站 25
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "25 通" || echo "25 被封"
```

### 处理方式（按推荐度）

1. **申请解封**：阿里云/腾讯云可提交工单申请解封 25（需备案域名、承诺不滥发），审核通过最省事。
2. **出口中继（smarthost）**：把外发交给第三方 SMTP，自己只负责收信与存储。
   - 可选：阿里云邮件推送、腾讯云 SES、AWS SES、Resend、Mailgun、Postmark
   - 配置位置：Stalwart 管理后台的 MTA 出站/路由设置，添加一条 smarthost 路由（host、port 587、用户名、密码、强制 TLS），并把默认出站路由指向它
   - 关键：中继商要能通过 SPF/DKIM 校验。在 `example.com` 的 SPF 里保留 `mx`，并加入中继商要求的 `include:`，DKIM 继续用你自己的域签名
3. **换一台不封 25 的机器**（境外 VPS 或独立服务器），只把出站交给它，收信仍在本机。

> 本仓库未把中继凭据写进 compose：它是运行时配置（管理后台或 `config.json`），属于账号级机密，不适合放进版本库。`.env.example` 里留了 `SMTP_RELAY_*` 作为记录位。

## 5. 进箱率检查清单

- [ ] `PTR` 指向 `mail.example.com`，且 `mail.example.com` 的 A 记录指回同一 IP（正反一致）
- [ ] `HELO` 名与 PTR 一致（Stalwart 用 `defaultHostname`，所以 hostname 必须是 `mail.example.com`）
- [ ] SPF 只有一条 `v=spf1`，无语法错误，`-all` 结尾
- [ ] DKIM 测试通过（Gmail 原文 → `dkim=pass`）
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
