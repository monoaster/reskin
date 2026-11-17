---
name: Pixel Art
slug: pixel
tag: 8-bit
accent: "#ff3c9e"
screen:
  - "draw at 128x128, upscale unblurred"
  - "use a fixed 16 colour palette"
  - "dither the sky with a bayer matrix"
  - "snap every joint to whole pixels"
---
# Pixel Art

Draw the whole frame at 128x128 into an array of palette indices, turn it into an ImageData, put that on an offscreen canvas and scale it to w x w with imageSmoothingEnabled = false on every context. Nothing is anti-aliased. Use exactly these 16 colours: #120d24 #2a1d4e #44347a #6b55b0 #ff3c9e #a8185f #ffd23f #fff4d6 #3fe0ff #1c8fd0 #1a4a8a #3ddc84 #1c7a4a #8a5a3c #4f321f #f2a07b. Divide world units by 7.8125 and round every joint. Build the sprite from 3-4 px Bresenham limbs with a 1 px ink outline: pink hoodie with a dark back, pocket and hood, blue jeans, cream sneakers, a round head with brown hair, a yellow headphone band and cups on the chest. The window sky is a 4x4 Bayer dithered gradient with 1-bit stars, a crescent moon and a lit skyline. Shadows are solid ink ellipses. Draw the HUD with a 3x5 bitmap font: "LINES x00" counts up while typing, plus "WORLD 1-1". At 2.8 the screen dither-wipes to green with a tick and SHIP, the HUD becomes flashing "+1000 SHIPPED", yellow rays burst out, the frame shakes one pixel for five frames, and confetti is 2x2 blocks that fade by dither.
