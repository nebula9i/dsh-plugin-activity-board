# DSH Activity board

A kanban board for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that organises chats by **activity** instead of by workspace.

DSH's sidebar groups conversations by project. When several projects are open at once, "what was I working on?" becomes a scroll through trees. This plugin adds a board whose columns answer that question directly.

## Columns

| Column | Meaning |
|---|---|
| **Waiting** | A chat needs you: approval, plan review, or an answer. Outranks everything. |
| **Working** | A turn is running right now. |
| **Done** | Finished within the last 12 hours. Falls back to Standby after that. |
| **Standby** | Quiet for more than 12 hours. |

Chats are grouped under their project inside each column. A project sits in the column of its most urgent chat, and chats that don't match their column are faded so the live ones stand out.

## Features

- **Projects as groups**, ordered by their most recent chat; each project carries a stable colour.
- **Pin a project** to float it above every unpinned one, in every column. Drag a pinned project onto another to swap them; unpinned groups cannot be dragged.
- **Compact mode** puts each title and its timestamp on one line.
- **Reorderable columns** by dragging the column header; the order persists.
- **Search** filters the board by chat title and project name, and the Host's content index adds chats matched only by message text, with the snippet shown inline.
- **New chat** and **New project** from the board header, plus a per-project `+` to start a chat in that project.
- **Right-click a card** for the same session menu the sidebar uses: pin, rename, fork, copy ID, archive, open in app.
- **Activity badge** on the entry button: green when chats finished unseen, yellow when one is waiting on you. It hides while you're on the board.
- **Command Code quota** in the header when that provider is installed: per-window ring, spend against cap, and when each window resets.
- **Project → Chat breadcrumb** in every chat header, with dropdowns to switch project or chat.
- **Headers** for the current timestamp rule: `5m ago` under a minute-to-hour, `5h ago` under a day, `1d ago` under 48h, then `18:31 - 3/11/26`, then `15/08/26`.

## Install

The plugin is a DSH bundle. From the plugin manager, install the package directory:

```sh
dsh plugin install /path/to/dsh-plugin-board
```

Or point a profile at it directly with `install_bundle` / a `link:` dependency, and add `@local/dsh-board` to the profile's bundle list.

The sidebar panel row gains an **Activity board** entry once the plugin activates.

## Notes and limits

- Timestamps render in the browser's locale and time zone.
- Pinned projects are stored per machine in the browser, not in the session log.
- The Done column is derived from the last activity time, so a chat you revisit returns to Done rather than Standby.
- The chat name itself is not clickable; switching chats is done from the dropdown beside it.
- On macOS the board header starts past the window buttons (close/minimize/zoom), which the hidden title bar draws inside the content area; the same clearance applies to the entry button in a chat header while the sidebar is collapsed.

## License

MIT
