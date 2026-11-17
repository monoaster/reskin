---
name: Neon Tube
slug: neon
tag: glass and gas
accent: "#ff2bd6"
screen:
  - "draw every shape as a glass tube"
  - "7px white core, coloured halo"
  - "blur it back in, mirror on floor"
  - "swap the laptop to green on ship"
---
# Neon Tube

Draw a night wall lit only by neon. The wall is near-black brick (58 x 25 px bricks, seeded random), visible only where light falls: multiply a brick texture with a light field made of blurred copies of the tube layer plus coloured radial gradients. Everything else is a tube: a 7 px near-white core, a coloured sheath, two shadowBlur passes (30 and 10 px), all with `lighter` compositing. Blur the tube layer at 1/2, 1/4, 1/8 and 1/16 size and add it back as bloom. Colours: body cyan, hoodie magenta, headphones amber, hair violet, shoes and clock orange, window blue, desk violet, plant lime. Draw limbs as outlines around the joints, not centre lines, and erase the tube layer under near body parts so far limbs do not tangle. Tube ends get small dark electrode caps. The floor is a wet mirror: strips of the tube layer flipped about y = 800, fading with depth, with a slow sine ripple. Flicker is deterministic from t. The sign SHIPPED is grey unlit glass until 2.8, then lights in two stutters with one tired letter. The laptop turns green, a check and tiny SHIPPED appear, and confetti are short glowing tubes.
