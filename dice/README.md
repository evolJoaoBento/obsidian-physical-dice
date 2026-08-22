# Dice packs

A pack is a folder in here. It holds the art for a set of dice and a
`pack.json` describing them. Copy `Texture-Pack-Default`, edit it, and pick the
new folder under **Dice pack** in the plugin's settings.

Everything about a set lives in its folder. The plugin's settings decide how big
the dice are overall, what colour they are and where the tray sits; the pack
decides everything else.

## The folder

```
My-Pack/
  pack.json
  d6_Numbers.png
  d20_Numbers.png
  ...
```

File names are up to you - `pack.json` says which file belongs to which die.
Without a `pack.json` the plugin looks for `<type>_Numbers.png` and leaves the
dice otherwise plain.

## The art

A face sheet is a **mask, not a picture**. Where it is transparent the die shows
its own colour, so the sheet paints only what is printed on the die: a faint
wash inside each face and opaque white digits. A fully opaque sheet will hide
the die's colour entirely and the colour picker will appear to do nothing.

The sheets that ship here are 1024x1024 with the net drawn once, unfolded.

## pack.json

```jsonc
{
  "name": "Default",

  // Edges taken off every die. depth is a share of the die's half-size.
  "bevel": { "enabled": true, "depth": 0.1 },

  // How the set is finished. Colour is the roller's, not the pack's.
  "material": { "shininess": 100, "specular": "#222222",
                "transparent": false, "opacity": 1 },

  "dice": {
    "d6": {
      "texture": "d6_Numbers.png",
      "normal": "d6_Normal.png",     // optional
      "scale": 0.7,                  // size next to the other dice
      "rimUV": [0.97, 0.97],         // blank sheet for the bevel's rim
      "numbers": [4, 3, 5, 2, 1, 6],

      // A cube's net lies on a grid, so its cells are columns and rows.
      // rotation is quarter turns anticlockwise, for flaps that fold rotated.
      "grid": {
        "cols": 4, "rows": 4,
        "cells": [{ "number": 1, "col": 1, "row": 0, "rotation": 3 }]
      }
    },

    "d20": {
      "texture": "d20_Numbers.png",
      "numbers": [1, 2, 3],
      "sheetSize": 1024,

      // Nothing else unfolds onto a grid, so its cells carry their own
      // corners, in pixels, in the order the image draws them.
      "faces": [
        { "number": 15, "corners": [[164, 92], [321, 1], [321, 184]], "turn": 0 }
      ]
    }
  }
}
```

### numbers

Which number each face carries, in **three.js's face order** - not the art's.
It is here to be kept in step with the cells, not to be chosen freely: the
values ship paired so opposite faces sum the way a die's should (7 on a d6, 9 on
a d8 and d10, 13 on a d12, 21 on a d20). Reorder them and the die still works,
but its opposite faces stop adding up.

A d10 counts from zero and really does have a face reading zero.

### turn, mirror, vertices

`turn` picks which of a cell's corners the die's first vertex lands on;
`mirror` reverses the winding. The artist drew each digit for one particular
unfolding and nothing in the geometry knows which, so these are read off a
rendered die rather than reasoned about.

`vertices` is for corner-read art. A d4 has no upward face, so it is read at the
corner its resting face leaves out, and every cell carries three digits - one by
each corner - instead of one in the middle. Setting `vertices` names the die
corner each cell corner belongs to, and `turn` and `mirror` are then ignored.

### rimUV

A point on the sheet with nothing printed on it. Bevelled edges wear it, and
because it is transparent there they come out in the die's own colour. Pick
somewhere clear of the net - the last column, or a corner the net does not
reach.

## Working them out

Two harness scripts do the tedious part, and both want Obsidian running with the
plugin's debug port open (see `harness/README.md`):

- `harness/scripts/net.js` reads a sheet and hands back every cell's corners.
  Cells are fenced off by the drawn border, so it floods each one, hulls it, and
  reduces the hull to the corner count the shape has. Set `window.__type` and
  `window.__sides` first.
- `harness/scripts/overlay.js` draws a table back over the sheet it describes.
  Outlines that land on the drawn borders say the corners are right; labels that
  land on the matching digits say the numbers are. Check a table this way rather
  than by reading digits off a rendered die - a digit drawn rotated in the net
  reads as a different digit, and a 2 turned upside down has been called a 5
  here more than once.
