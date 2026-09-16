# Ink
A plugin for [Obsidian](https://obsidian.md) that adds the ability to hand write or draw with a stylus between paragraphs in your notes.

> This branch is a private personal customization maintained by NarenkuII. The original plugin and copyright belong to Dale de Silva. Because the upstream project uses CC BY-NC-ND 4.0, do not publish or redistribute this modified build without the original author's permission.

## Narenku custom build

This build keeps the `ink` plugin ID so existing notes, settings, and SVG files remain compatible.

- Pen colours: theme black/white, blue, red, and green. The selected colour remains visible in locked previews.
- Pen tuning: configurable size and stabilization, pressure smoothing, and improved small-dot handling.
- Selection: drag from inside the frame, large touch targets, rotation, and finger support. A selection-only scale lock is enabled by default; disable it to stretch width and height independently. Colour swatches recolour every selected stroke as one undoable action, and changing tools clears the selection. The selected stroke frame and its handles keep pointer priority over an image underneath. A recognized line uses two endpoint handles plus a central move handle instead of a large box.
- Clipboard: select strokes or an image, then use `Ctrl/Cmd+C` and `Ctrl/Cmd+V`; `Ctrl/Cmd+D` or the duplicate button makes an offset copy.
- Image annotation: import a screenshot or photo with the image button. It is stored below the ink. In Select mode, long-press an unselected image for 350 ms to move, scale, rotate, duplicate, or delete it; a geometric fallback handles iPadOS SVG event retargeting and the stroke marquee never captures images.
- Shape recognition: hold the pointer still for 250 ms at the end of a line or closed shape. The live stroke snaps before lift and tolerates small Pencil movement afterward. Equal-distance resampling, normalized template matching, and clustered corner detection recognize forgiving lines, rectangles, perfect circles, and common single-stroke arrows. Rectangles use dense straight-edge geometry so brush smoothing cannot distort them; near-horizontal and near-vertical lines keep their starting point fixed. Undo removes the recognized result.
- Eraser modes: whole-stroke erasing is enabled by default. Toggle the eraser-mode button for precise partial erasing; precise mode masks the original pixels under the eraser disk before drawing the same 35% preview as whole-stroke mode, and both modes support undo.
- Mobile layout: smart-mode toggles stay on the left, Select/Draw/Erase stay centered, and colours move to a visible second row before controls overlap on narrow iPad or phone canvases.

Imported images are resized to at most 2048 pixels and embedded in the Ink SVG. This keeps files portable across Windows, iPadOS, and Android, but image-heavy notes can still increase Git repository size.

Hand write or draw directly between paragraphs in your notes using a digital pen, stylus, or Apple pencil. Useful for handwriting, sketches, scribbles, or even math equations and scientific notation. Runs on the tldraw framework and drawing provides an infinite canvas.

## 🎥 Demo
<!--
  Single-cell tables: community.obsidian.md adds large margins to images inside <p>,
  and multi-row tables draw a border between rows that border="0" cannot override.
  One <a> wraps image + caption so both are one hit target.
-->
<table align="center" border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td align="center">
      <a href="https://www.youtube.com/watch?v=plrnx7J_Avc" target="_blank">
        <img src="docs/media/writing-sample.gif" width="80%" alt="Video of using Ink"><br>
        Click to play features overview
      </a>
    </td>
  </tr>
</table>

## 📓 Development Diaries

<p align="center">
  I record regular devlogs about my projects.
</p>
<table align="center" border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td align="center">
      <a href="https://youtube.com/playlist?list=PLAiv7XV4xFx2NMRSCxdGiVombKO-TiMAL&si=TarnAk9A4kzzy0Gu" target="_blank">
        <img src="docs/media/devlogs-screenshot.png" width="80%" alt="Screenshot of devdiary video"><br>
        Click to view devlogs
      </a>
    </td>
  </tr>
</table>

<!-- One-row tables keep badge images inline on community.obsidian.md (Tailwind preflight forces img { display: block }). -->
<table align="center" border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td>
      <a href="https://twitter.com/daledesilva" target="_blank">
        <img src="docs/media/twitter-btn.svg" height="40" alt="Dale de Silva on Twitter">
      </a>
    </td>
    <td>
      <a href="https://indieweb.social/@daledesilva" target="_blank">
        <img src="docs/media/mastodon-btn.svg" height="40" alt="Dale de Silva on Mastodon">
      </a>
    </td>
    <td>
      <a href="https://www.threads.net/@daledesilva" target="_blank">
        <img src="docs/media/threads-btn.svg" height="40" alt="Dale de Silva on Threads">
      </a>
    </td>
    <td>
      <a href="https://bsky.app/profile/daledesilva.bsky.social" target="_blank">
        <img src="docs/media/bluesky-btn.svg" height="40" alt="Dale de Silva on Bluesky">
      </a>
    </td>
  </tr>
</table>


## 💾 Installation
You can find this plugin in the plugin directory within Obsidian.
<details>
<summary>Click for help installing plugins</summary>

1. Open your Obsidian vault and go to **Settings**.

2. Click on **Community Plugins** in the side bar.

3. If you haven't already, you will need to turn on community plugins.

4. Search 'Dale de Silva' and install **Ink**.
</details>

If you would like to install new versions of the plugin that are still being tested, you can install this plugin through BRAT instead.
BRAT is another community plugin that allows you to install a Beta version. New features are released as a Beta version first and can take from a few days to a month before landing in the standard version.
<details>
<summary>Click for Beta version installation instructions</summary>

1. Open your Obsidian vault and go to **Settings**.
2. Click on **Community Plugins** in the side bar.
3. Turn on community plugins and click **Browse**.
4. Search and install **BRAT**.
5. Scroll down and **activate** BRAT.
6. In the BRAT menu in the side pane, select **Add Beta Plugin**.
7. Follow the instructions presented.
8. When a URL is requested, use: `https://github.com/daledesilva/obsidian_ink`

</details>
<details>
<summary>Click for Beta version update instructions</summary>

- BRAT is set to update Beta plugins by default on startup, however, this can sometimes take some time.
- To force an update, run BRAT's Obsidian commnd `Choose a single plugin to update` and choose Ink.
</details>

## 🏛️ License
>Please note that while this repository is public and can be browsed and modified for your personal use, it is not open source. It is licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) — see the root [`LICENSE`](LICENSE) file for the full legal text. Contributions are accepted under the [Contributor License Agreement](docs/CLA.md).

## 🪳 Report a bug
Found something that's not quite working right or do you have a feature request? Don't be shy, feel free to make some noise over on the [GitHub Issues](https://github.com/daledesilva/obsidian_project-browser/issues) page. But be sure to check if someone has already posted the same issue and comment on theirs if they have.

## ❤️ Support
If you find this plugin saves you time or helps you in some way, please consider supporting my development of plugins and other free community material like this.

<table border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td>
      <a href="https://twitter.com/daledesilva" target="_blank">
        <img src="docs/media/twitter-btn.svg" height="40" alt="Dale de Silva on Twitter">
      </a>
    </td>
    <td>
      <a href="https://indieweb.social/@daledesilva" target="_blank">
        <img src="docs/media/mastodon-btn.svg" height="40" alt="Dale de Silva on Mastodon">
      </a>
    </td>
    <td>
      <a href="https://www.threads.net/@daledesilva" target="_blank">
        <img src="docs/media/threads-btn.svg" height="40" alt="Dale de Silva on Threads">
      </a>
    </td>
    <td>
      <a href="https://bsky.app/profile/daledesilva.bsky.social" target="_blank">
        <img src="docs/media/bluesky-btn.svg" height="40" alt="Dale de Silva on Bluesky">
      </a>
    </td>
    <td>
      <a href="https://ko-fi.com/N4N3JLUCW" target="_blank">
        <img src="docs/media/support-btn.svg" height="40" alt="Support me on Ko-fi">
      </a>
    </td>
  </tr>
</table>

## 🤖 My other work
You can find links to my other projects on [designdebt.club](https://designdebt.club), where I blog about design and development, as well as release other plugins like this one. You can also find my writing at at [falterinresolute.com](https://falterinresolute.com) where I combine philosophy and animation.

<table border="0" cellspacing="0" cellpadding="0">
  <tr>
    <td>
      <a href="https://designdebt.club" target="_blank">
        <img src="docs/media/design-debt-club-btn.svg" height="50" alt="Design Debt Club">
      </a>
    </td>
    <td>
      <a href="https://falterinresolute.com" target="_blank">
        <img src="docs/media/falter-in-resolute-btn.svg" height="50" alt="Falter In Resolute Blog">
      </a>
    </td>
  </tr>
</table>
