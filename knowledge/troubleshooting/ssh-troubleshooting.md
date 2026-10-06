# SSH 无法连接 ECS 实例的排查流程

本页给出 SSH 连不上 ECS 时的固定排查顺序。原则是**从外到内逐层收敛**：先确认实例与链路可达，
再确认安全组放通，然后确认实例内 sshd 在监听，最后才查认证与密钥。跳层排查最常见的后果是
反复换密钥、实际问题在安全组。

## 1. 实例状态与链路

- 控制台确认实例处于**运行中**；刚重启或系统盘打满的实例，sshd 可能起不来。
- 检查 CPU / 内存 / 系统盘使用率是否打满。系统盘 100% 时 sshd 无法写日志、无法 fork 会话，
  表现就是「TCP 能通但认证后立刻断开」。
- 从客户端测端口连通性，区分「网络不通」与「服务未监听」：

```bash
nc -vz <公网IP> 22        # 或 telnet <公网IP> 22
```

连接被立即拒绝（Connection refused）说明链路与安全组是通的，问题在实例内 sshd；
超时（timed out）说明流量在半路被丢，优先查安全组与路由。

## 2. 安全组

- 入方向是否存在放行 TCP 22 的规则，**协议类型必须是 TCP 而非 ICMP 或 ALL 的误配**。
- 授权对象是否覆盖客户端出口 IP。家庭宽带与 4G 网络出口 IP 会变，把源设成 `0.0.0.0/0`
  虽然可用但不安全，应改为具体 IP/32 或使用阿里云 Workbench 入口网段。
- 实例绑定多个安全组时规则取并集，但**显式拒绝优先级高于放行**（数值越小优先级越高）。
- 客户端本机出口 IP 可用 `curl ifconfig.me` 确认，注意公司代理与 VPN 会改变它。

## 3. 实例内 sshd

通过 VNC 或 Workbench 登录（不依赖 22 端口）后检查：

```bash
systemctl status sshd
ss -tlnp | grep :22
```

`sshd -T` 会打印生效配置，可用来核对端口与认证开关。服务停止则 `systemctl restart sshd`；
若重启失败，用 `sshd -t` 校验 `/etc/ssh/sshd_config` 语法（改过 Port、PermitRootLogin、
PasswordAuthentication 之后最常在这里出错）。sshd 监听端口被改成非 22 时，
安全组规则必须同步改端口范围。

## 4. 认证与密钥

- 私钥权限必须 `chmod 400 key.pem`，权限过宽 ssh 客户端会直接拒用该密钥。
- 用户名：Alibaba Cloud Linux / CentOS 系默认 `root`（或 `ecs-user`，视镜像），
  Ubuntu 官方镜像默认 `ubuntu`。镜像重置密码或初始化脚本会覆盖控制台设置的密钥绑定。
- 服务端拒绝线索在 `/var/log/secure`（CentOS / Alibaba Cloud Linux 系）或
  `/var/log/auth.log`（Debian / Ubuntu 系）：
  `Permission denied (publickey)` 是密钥不匹配，`Connection closed by ... preauth`
  多为认证方式被禁用或 IP 被 fail2ban 类策略封禁。

## 5. 兜底通道

三层都排查不出结果时，用 VNC 登录（不受安全组与 sshd 影响）修复实例，
或用云助手 `SendCommand` 在不登录的情况下执行命令、采集 `journalctl -u sshd`。
修复完成后回到第 2 步开始复测，确认不是修改引入的新问题。
