---
'@richardmcquiston01/dashboard-widgets-toolkit': minor
---

One Arrange menu per card. The card's edit controls (move up, move down, move to page, hide) used to be separate buttons and wrapped onto a second row in narrow cards; they are now a single four-arrow icon that opens a small floating menu with Move earlier, Move later, the pages the widget can move to (with free rows and "New page…") and Hide. Locked items are left out, Move earlier and later are disabled at the ends, and the menu has arrow-key navigation, Escape and outside-click to close. Minimize stays its own button. Because the buttons are gone, code or tests that looked for the "Move X earlier", "Move X later" or "Hide X" buttons (or the Move to page icon) now find them inside the menu, once opened, under the same accessible names. New labels: `arrangeWidget`, `menuMoveEarlier`, `menuMoveLater`, `menuHide`.
