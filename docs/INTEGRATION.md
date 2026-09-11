# Kiosk integration

Paste one script tag where the widget should appear.

```html
<script src="https://kiosk-dreamdex.vercel.app/embed.js" data-kiosk="SLUG" data-asset="BTC" async></script>
```

Replace `SLUG` with the registered code. Replace `BTC` with the asset to show on load.

## Attributes

| Attribute | Required | Purpose |
| --- | --- | --- |
| `data-kiosk` | Yes | The registered code for this host. It selects the fee split and the dashboard row. |
| `data-asset` | No | The asset shown on load. Defaults to `BTC` when omitted. |

## Registration

The code must be registered on the KioskRouter contract before it quotes a fee.

- Contract: `0x57ED83B351eDe66b2cb9C0dDa1F2247E1Cc62Be7`
- Chain: 50312

An unregistered code does not quote. The widget refuses to quote instead of showing a wrong fee.

## Fee

The fee is 25 bps of routed notional. The trader pays it inside `KioskRouter.route`.

- 13 bps goes to the host.
- 12 bps goes to the platform.

The split is enforced on chain. The reader signs `placeBinaryOrder` with their own wallet. The position stays with the reader.

## Earnings

Read earnings on chain with `KioskRouter.stats(code)`. Or open the dashboard:

```
https://kiosk-dreamdex.vercel.app/dashboard?code=SLUG
```

Replace `SLUG` with the registered code.

## Isolation

The loader plants a sandboxed iframe where the tag sits. The iframe cannot read the host page. The host page cannot read wallet state inside the iframe.
