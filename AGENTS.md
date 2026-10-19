# Project Instructions

- When adding user-facing strings, translate or route them through the existing localization flow when appropriate.
- All app buttons must expose a hover tooltip on web, usually via the existing `webTitle(...)` helper.
- Choose icons that are visually polished and semantically match the action; avoid generic or confusing icons when a clearer icon exists.
- Never render buttons touching or glued together without spacing. All adjacent or stacked buttons (in dialogs, cards, toolbars, action bars, etc.) must have explicit, comfortable spacing (minimum gap of 10-12px, plus proper margin separating them from preceding text or inputs). Modal and dialog buttons must always be wrapped in dedicated action containers (such as `dialogActions`), never dumped directly inside dialog containers without spacing.
