# Component template

```text
<ComponentName>/
  index.tsx            # Component entry
  styles.ts            # Styles (design tokens)
  types.ts             # Type definitions
  __tests__/           # Component unit tests
```

Key points: reuse the component library, controllable state, the three states loading / error / empty, i18n keys.

---

## L3 required depth fields

| Field | Requirement |
|------|------|
| Three states | loading/error/empty |
| Compatibility matrix | Browsers / resolutions |
