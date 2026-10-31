# scripts/ — Frontend UI skill scripts

This directory contains the deterministic check scripts for the `dev-frontend-ui` skill. All scripts follow one interface convention: CLI invocation, JSON output, and the exit code reports the result.

## Script list

| Script | Purpose | Exit codes |
|------|------|--------|
| `ui_lint.py` | Design fidelity check: scan style files for raw colors and design tokens | 0/1 |
| `a11y_check.py` | Accessibility scan: check common A11y issues such as img without alt and button without label | 0/1 |
| `bundle_analyze.py` | Bundle size analysis: total the file sizes in a directory and mark oversized files | 0 |

---

## ui_lint.py

### Purpose
Design fidelity check: scans style files (.css/.scss/.ts/.tsx/.vue) for raw hex colors (such as `#FF0000`). If the file also does not use the design token (`--color-primary`), it is marked as a violation. Ensures colors always go through design tokens.

### Interface
```
python ui_lint.py <source_dir> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `source_dir` | Source directory; `.css`/`.scss`/`.ts`/`.tsx`/`.vue` files are scanned recursively |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | No raw color violations (including an empty directory) |
| 1 | Raw color violations found (file contains hex colors but no design token) |

### Checks
1. **Hex color detection**: the regex `#[0-9a-fA-F]{6}` matches 6-digit hex colors.
2. **Design token detection**: check whether the file contains `--color-primary`.
3. **Violation decision**: a file with hex colors and without `--color-primary` is a violation.
4. **raw_colors truncation**: at most the first 5 hex colors per file are output.
5. **issues truncation**: at most 20 violations are output.
6. **Empty directory handling**: when the directory does not exist or has no style files, output empty issues (exit=0).

### Design token recognition
| Token prefix | Purpose |
|---------|------|
| `--color-primary` | Primary color |
| `--spacing-` | Spacing |
| `--font-` | Font |

### Input JSON example
No input JSON; the script scans the directory directly:
```css
/* style.css */
.a { color: #FF0000; }
.b { background: #00FF00; }
```

### Output JSON example
```json
{
  "issues": [
    {"file": "src/style.css", "raw_colors": ["#FF0000", "#00FF00"]}
  ],
  "count": 1
}
```

### Usage examples
```bash
# Design fidelity check
python skills/dev-frontend-ui/scripts/ui_lint.py src/

# Raw color case (contains #FF0000 but no --color-primary)
python skills/dev-frontend-ui/scripts/ui_lint.py raw_color_src/

# CI gate (passes only with zero raw colors)
python skills/dev-frontend-ui/scripts/ui_lint.py src/ && echo "Design fidelity check passed" || echo "Raw color violations found"
```

### Unit tests
The `dev-frontend-ui/ui_lint.py` entry in `tests/test_scripts.py` (3 cases):
- `raw_color`: `.a { color: #FF0000; }` → exit=1, output contains `issues`
- `clean_styles`: `.a { color: var(--color-primary); }` → exit=0, output contains `issues`
- `missing_dir`: directory does not exist → exit=0, output contains `issues`

---

## a11y_check.py

### Purpose
Accessibility scan: checks frontend template files (.tsx/.vue/.html) for common A11y issues, including img without alt and clickable elements (button/a) without an accessible name.

### Interface
```
python a11y_check.py <source_dir> [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `source_dir` | Source directory; `.tsx`/`.vue`/`.html` files are scanned recursively |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | No A11y issues (including an empty directory) |
| 1 | A11y issues found (img without alt or clickable element without label) |

### Checks
1. **img without alt**: an `<img>` tag has no `alt=` attribute.
2. **Clickable element without label**: a `<button>` or `<a>` tag has no `aria-label` and is directly followed by a child element (no text content).
3. **issues truncation**: at most the first 50 issues are output.
4. **Empty directory handling**: when the directory does not exist or has no template files, output empty issues (exit=0).

### A11y rule table
| Rule | Severity | Description |
|------|---------|------|
| img is missing the alt attribute | Major | Images need alt text (an empty alt marks a decorative image) |
| Clickable element has no accessible name | Major | button/a needs an aria-label or text content |

### Input JSON example
No input JSON; the script scans the directory directly:
```html
<!-- page.html -->
<img src='avatar.png'>
<button><icon /></button>
```

### Output JSON example
```json
{
  "issues": [
    {"file": "src/page.html", "issue": "img is missing the alt attribute"},
    {"file": "src/page.html", "issue": "Clickable element has no accessible name"}
  ],
  "count": 2
}
```

### Usage examples
```bash
# A11y scan
python skills/dev-frontend-ui/scripts/a11y_check.py src/

# img without alt case
python skills/dev-frontend-ui/scripts/a11y_check.py bad_a11y_src/

# CI gate (passes only with zero A11y issues)
python skills/dev-frontend-ui/scripts/a11y_check.py src/ && echo "A11y check passed" || echo "A11y issues found"
```

### Unit tests
The `dev-frontend-ui/a11y_check.py` entry in `tests/test_scripts.py` (3 cases):
- `img_no_alt`: `<img src='a.png'>` → exit=1, output contains `issues`
- `clean_page`: `<img src='a.png' alt='ok'>` → exit=0, output contains `count`
- `missing_dir`: directory does not exist → exit=0, output contains `count`

---

## bundle_analyze.py

### Purpose
Bundle size analysis: totals the size of all files in a directory and marks oversized files above the threshold. Used as the size gate for frontend build output (dist).

### Interface
```
python bundle_analyze.py <dist_dir> [--limit_kb <KB>] [--json]
```

### Arguments
| Argument | Description |
|------|------|
| `dist_dir` | Build output directory; all files are scanned recursively |
| `--limit_kb` | Large file threshold (KB), default 300; files above it go into large_files |
| `--json` | Output JSON (JSON is already the default) |

### Exit codes
| Code | Meaning |
|----|------|
| 0 | Analysis complete (whether or not large files were found) |

> This script is an **analysis tool** and does not block the flow; the exit code is always 0, and the CI configuration decides the size gate by checking whether large_files is empty.

### Checks
1. **File size total**: recursively sum the size of all files under dist_dir into total_kb.
2. **Large file marking**: a file larger than `--limit_kb` (default 300KB) goes into large_files.
3. **large_files order**: output by file path; each entry has file and kb (1 decimal place).
4. **Empty directory handling**: when the directory does not exist, output total_kb=0 and empty large_files (exit=0).

### Input JSON example
No input JSON; the script scans the directory directly:
```
dist/
├── main.js       (50 KB)
├── vendor.js     (400 KB)
└── styles.css    (20 KB)
```

### Output JSON example
```json
{
  "total_kb": 470.0,
  "large_files": [
    {"file": "dist/vendor.js", "kb": 400.0}
  ]
}
```

### Usage examples
```bash
# Analysis with the default threshold (300KB)
python skills/dev-frontend-ui/scripts/bundle_analyze.py dist/

# Analysis with a custom threshold (200KB)
python skills/dev-frontend-ui/scripts/bundle_analyze.py dist/ --limit_kb 200

# CI integration (output used by the size gate)
python skills/dev-frontend-ui/scripts/bundle_analyze.py dist/ > bundle_report.json
```

### Unit tests
The `dev-frontend-ui/bundle_analyze.py` entry in `tests/test_scripts.py` (3 cases):
- `small_bundle`: small file `x=1` → exit=0, output contains `total_kb`
- `large_bundle`: large file of 400000 characters → exit=0, output contains `large_files`
- `missing_dir`: directory does not exist → exit=0, output contains `total_kb`

---

## Limits

- These scripts are **lightweight static checks** and do not replace professional frontend tooling (Lighthouse / axe-core / Webpack Bundle Analyzer).
- `ui_lint.py` only detects **raw hex colors coexisting with design tokens** and does not check sizes / fonts / spacing; a full design fidelity check needs an alignment tool such as Figma Inspect.
- `a11y_check.py` only detects two kinds of issues, **img alt and button/a label**; a full A11y audit needs axe-core or Lighthouse.
- `bundle_analyze.py` only measures **file size** and does not analyze the module dependency tree or tree-shaking; deep analysis needs Webpack Bundle Analyzer.
- At L3, fund-related frontend pages must additionally cover field-level validation, form security, state machine duplicate prevention and exception path UI.
