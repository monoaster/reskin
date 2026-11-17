---
name: ASCII Terminal
slug: ascii
tag: text only
accent: "#4dff7a"
screen:
  - "draw 112x112 cells from an atlas"
  - "pick glyphs by luminance and class"
  - "add bloom, scanlines, curved glass"
  - "banner shipped in # characters"
---
# ASCII Terminal

Make the whole scene out of text on a green CRT. Draw a flat silhouette of the scene into a hidden 112 x 112 canvas, one pixel per character cell, in greys where grey means brightness. Draw each object class in its own pass: window and poster dim blue #3d6fb5, floor #23a04a, desk #c07c2a, laptop and headphones cyan #5ef0ff, plant #37d36c, hoodie amber #ffb000, figure #dcffe6. Turn each cell into a glyph from the ramp " .:-=+*oxX#%@" by brightness, with a 4x4 ordered dither, coloured by its class. Pre-render every glyph in every colour into an atlas and blit it per cell; the bottom 18 rows are a terminal strip in #4dff7a that types "$ ship --now" and prints the footfalls and story(t).chars. Look: a faint ghost dot grid, scanlines, bloom made by shrinking the text layer twice and adding it back, a barrel warp, vignette and rounded corners. At t=2.8 the laptop becomes a solid # block with a tick, the screen flashes green, a SHIPPED banner of # characters (5x7 font at double size) slides in, and confetti are single characters * + o x.
