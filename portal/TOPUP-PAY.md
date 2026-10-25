# PayPal 充值入口（网站）

`topup-pay.js` + `topup-pay.css`：在登录后的「银行卡 / 支付宝」那一行旁边加一个 **PayPal** 按钮。
**默认完全隐藏**——只有同时满足下面三点才出现：

1. `index.html` 里设了 `window.XC_TOPUP_API = 'https://<云闸域名>'`（空 = 功能关闭）；
2. 云闸 `GET /v1/topup/cards` 返回 `payment_providers.paypal.enabled === true`（云闸配了 `PAYPAL_CLIENT_ID/SECRET` 等）；
3. 页面里有 `<button data-pay="paypal" hidden>`。

前端没有任何密钥；PayPal 的钥匙只在云闸（aoi-cloud）环境变量里。

## 接入（线上站点的源码目前不在 git 里，所以给一个补丁而不是直接改 index.html）
`index-paypal.patch` 是对当前线上 `index.html`（deploy_wwwxc_v3）生成的补丁：加按钮 + 两个资源标签 + `XC_TOPUP_API=""`。
把 `topup-pay.js`、`topup-pay.css` 放到站点根目录，应用补丁，然后在云闸配好后把 `XC_TOPUP_API` 填上。
（注意：另有人在改主页的登录后才显示内容的逻辑；本补丁只动 `.auth-entries` 这一行，合并时请人工核对。）

## 云闸需要的配置（见 aoi-cloud PR）
- `PAYPAL_RETURN_URL=https://www.x-connect.ai/?topup=paypal`、`PAYPAL_CANCEL_URL=https://www.x-connect.ai/?topup=paypal_cancel`
- `TOPUP_CORS_ORIGINS=https://www.x-connect.ai`（浏览器直连云闸需要）
- 云闸要对浏览器公开可达（目前 `api.x-connect.ai/v1/topup/cards` 要凭证，`gate.soundtitle.org` 没部署 topup 路由）

## 验证
`node --test portal/topup-pay.test.mjs`（纯函数）；另用 headless Chrome 对线上页面副本 + 假云闸做过点击流程：
禁用 → 隐藏；启用 → 显示 → 选面值 → POST order → 跳 paypal.com；回跳 `?topup=paypal&token=…` → POST capture → 显示兑换码。
没有对真 PayPal 测过。
