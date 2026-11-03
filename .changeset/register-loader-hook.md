---
"@ugoku/core": minor
---

Add `registerLanguageLoader`/`registerThemeLoader` so a site can teach the lazy `run edit` re-highlighter about a custom Shiki grammar or theme that isn't in Shiki's own bundle — reusing the same loader the site already passes to its main Shiki/VitePress config.

```ts
import { registerLanguageLoader, registerThemeLoader } from '@ugoku/core';

registerLanguageLoader('my-lang', () => import('./my-lang.tmLanguage.json'));
registerThemeLoader('my-theme', () => import('./my-theme.json'));
```

Call these once, at site init. Without registration, an unbundled grammar/theme still works for editing and running — it just falls back to plain-text (no live re-highlighting) with a one-time warning in the block's output panel, same as before this change.
