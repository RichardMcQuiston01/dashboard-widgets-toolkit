---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Detail view, core part (phase 1 of `docs/design/detail-view.md`; no UI yet).
Widget definitions gain `detail` (`true` or `{ title, pageSize, mode }`), and
the core adds the data and query types (`DetailData`, `DetailQuery`,
`DetailProvider`), `queryRows` (accent- and case-insensitive filtering,
locale-aware and numeric sorting, paging), `serializeDetailQuery` and
`parseDetailQuery` for URLs, `validateDetailData`, `resolveDetailOptions` and
`defaultDetailQuery`. `validateWidgetDefinition` checks `detail`.
