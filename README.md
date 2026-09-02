# ⚠️ Better version here: [exclusive-fullscreen@pointblank](https://github.com/Ao1Pointblank/exclusive-fullscreen)



Cinnamon Extension - Fullscreen to Workspace

Fork of [mttbernardini/fullscreen-to-workspace](https://github.com/mttbernardini/fullscreen-to-workspace) extension, updated jankily to work on modern Cinnamon DE (tested on 6.6.9)

Original description by @satran:

> I got inspired by a feature by Elementary OS (which comes from macOS). It moves a fullscreen application to a separate workspace. This extension does just that. A lot of the code ideas come from https://github.com/rliang/gnome-shell-extension-maximize-to-workspace.

## Installation

```sh
cd ~/.local/share/cinnamon/extensions/
wget https://github.com/pointblank/fullscreen-to-workspace/archive/master.zip
unzip master.zip
mv fullscreen-to-workspace{-master,@pointblank}
rm master.zip
```

## Original Dev notes

- In Cinnamon there's no `size-change` event on the `window_manager` object. For now I found `size-changed` event on window actors, but probably does not scale well.
- I fixed common scenario bugs, but there might still be some edge cases that I didn't check yet. More testing is needed.

## My Dev notes
- I couldn't get the old method of detecting a window state change to work, so instead it runs a polling loop that detects fullscreen windows and moves them to a workspace with a title matching the application.
- Brave's Leo AI was used to create this in about 10-15 minutes. It's hacky, but seems to work so far. 
