---
'@richardmcquiston01/dashboard-widgets-toolkit': patch
---

Move the framework-free parts of the React layer into the core so other renderers can share them: the chart model and geometry (`buildChartModel`, `describeChart`, `barPath`, `chartX`, `chartY`, ...), the default labels and class slots (`DEFAULT_LABELS`, `joinClassNames`) and the chart palette (`seriesColor`, `CHART_COLORS`). `./react` still exports everything it did; nothing changes for existing users.
