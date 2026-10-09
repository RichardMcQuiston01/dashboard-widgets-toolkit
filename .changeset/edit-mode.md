---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

Edit mode for `Dashboard`. `editMode="toggle"` shows the move and hide controls only after the viewer presses Customize, with a toolbar (Done, Reset layout, Revert changes), a dashed outline on cards while editing, and a lock icon on locked cards. Reset restores `defaultLayout` and Revert restores the layout from when Customize was pressed; both ask first with an inline "✓" / "X" confirmation. Control it with `editing`, `defaultEditing` and `onEditingChange`, hide the built-in toolbar with `toolbar={false}`, and override the text through `labels`. The default `editMode="always"` is unchanged. With `overrideLocks`, locked cards show a "locked for viewers" icon.
