# 2G 内存下的调优

## 1. 实测基线

本地实测（Windows + Docker Desktop，Stalwart v1.0.3，内嵌 RocksDB，无防火墙规则）：

```
stalwart   104.4MiB / 1GiB    CPU 1.06%（空闲）
```

空载约 **105MB**，容器限额 1G 有充足余量。对比 mailcow 全家桶（Postfix + Dovecot + SOGo + Rspamd + ClamAV + MariaDB + Redis）社区普遍建议 4GB 以上，本方案在 2G 机器上属于宽裕而非勉强。

真实负载下内存主要增长点：并发 IMAP/JMAP 会话、全文索引、反垃圾规则、RocksDB 块缓存。

## 2. 已经做的裁剪

| 项 | 做法 | 位置 |
|---|---|---|
| 不额外跑数据库 | 用内嵌 RocksDB，不启 PostgreSQL | `docker-compose.yml` 的 `postgres` profile 默认关闭 |
| 容器内存上限 | `mem_limit: 1g` + `memswap_limit: 1g`（禁用 swap 逃逸） | `docker-compose.yml` |
| 反垃圾 | 初始化时**不启用** Spam filter 规则，不配 DNSBL | 向导 / 管理后台 |
| 日志 | `Stdout` 而非写文件，避免日志轮转占盘 | 向导第 4 屏，或 `x:Tracer/set` |
| 容器日志 | `json-file` 10MB × 3 | `docker-compose.yml` |

## 3. 反垃圾到底关了什么

Stalwart v1.0.3 的形势（实测）：

- `x:SpamFilter/get` → `unknownMethod`（没有这个对象名，别照旧文档猜）
- `x:SpamClassifier/get` → 空列表，说明未配置分类器
- 启动日志仍有 `trainSpamClassifier` 定时任务，但无训练数据时开销接近 0

所以「关闭反垃圾」在本方案里等于：**向导里不勾选反垃圾/规则引擎，初始化后在管理后台确认 `Spam classifier` 无规则、无 DNSBL 查询**。

代价与替代：

- 代价：垃圾邮件直接进收件箱。个人域名新号本身收信量小，且外部大厂发信方基本都有 SPF/DKIM/DMARC，Stalwart 内置的 DMARC/SPF 校验仍在工作（这部分不占多少内存，不要关）。
- 替代：用 Sieve 写规则（`urn:ietf:params:jmap:sieve`）按发件人/主题过滤，成本极低；或在客户端侧标记。

> 不要关 `generateDkimKeys` 与 DMARC 校验：前者影响进箱率，后者是防伪造的第一道闸。

## 4. RocksDB 缓冲

`x:Bootstrap/get` 里的 `dataStore` 实测默认值：

```json
{ "@type": "RocksDb", "path": "/var/lib/stalwart/", "blobSize": 4096, "bufferSize": 134217728, "poolWorkers": null, "cacheSize": null }
```

`bufferSize` 默认 128MB，是单机内存占用的大头。2G 机器建议降到 64MB 甚至 32MB：

```json
["x:Bootstrap/set", { "update": { "singleton": {
  "dataStore": { "@type": "RocksDb", "path": "/var/lib/stalwart/", "blobSize": 4096,
                 "bufferSize": 67108864, "poolWorkers": null, "cacheSize": 33554432 }
} } }, "s"]
```

⚠️ **必须在 bootstrap 模式（首次 setup 前）提交**。实测 setup 完成后再调用会返回：

```
{"type":"forbidden","description":"This operation is only allowed in bootstrap mode"}
```

补充：`Bootstrap` 对象在 setup 完成后 `x:Bootstrap/get` 返回 `notFound: ["singleton"]`。已初始化的实例要改存储只能编辑 `data/etc/config.json` 后重启（先冷备）。

## 5. 全文索引

`x:SearchStore/get` 返回空列表 = 使用 `Default`（复用数据存储）。个人邮箱（几千封）索引体积很小，**建议保留**，否则搜索退化成只搜主题/发件人。

要极致省内存再考虑关闭：不配置 search store，搜索改由前端用 `Email/query` 的 `text` filter（Stalwart 会退化为数据库扫描，邮箱大时变慢）。

## 6. 观测方法

```bash
# 实时内存
docker stats --no-stream stalwart

# 限制是否被打到（OOM 会重启容器）
docker inspect stalwart --format '{{.State.OOMKilled}} {{.RestartCount}}'

# 进程内视角
docker compose exec stalwart sh -c 'cat /proc/1/status | head -20'

# 队列是否积压（出站 25 被封的典型症状）
docker compose logs --since 10m stalwart | grep -Ei 'queue|deferred|refused'
```

建议阈值：

| 指标 | 正常 | 需要处理 |
|---|---|---|
| 常驻内存 | < 400MB | > 700MB（接近 1G 上限，易 OOM） |
| 队列积压 | 0～少量且快速消化 | 持续增长（查 25 端口与 PTR） |
| OOMKilled | false | true（降 `bufferSize`、降容器限额外的其它负载） |

## 7. 如果内存仍然吃紧

按收益排序：

1. `bufferSize` 128MB → 64MB（省 ~64MB，重启生效，需冷备后改 config.json）
2. 关闭全文索引（省索引内存，代价是搜索变慢）
3. 把容器限额降到 768MB，用限额逼出真实峰值（`docker stats` 观察是否频繁触顶）
4. 加 1GB swap 并**不要**设 `memswap_limit`（代价：极端情况下卡顿而非 OOM）
5. 最后手段：换 4G 机器，或把邮件正文 blobs 放 S3（`blobStore`），换取本地磁盘与缓存压力下降
