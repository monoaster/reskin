---
name: Isometric Voxel
slug: voxel
tag: isometric cubes
accent: "#ff9a3c"
screen:
  - "build it from 12 unit cubes"
  - "view it in true isometric"
  - "voxelise the rig every frame"
  - "shade top, left, right in 3 tones"
---
# Isometric Voxel

Build the whole scene from cubes of 12 world units in a true isometric view: world x runs down-right, z runs down-left, height is 800 - y. Show a diorama with a back wall and a side wall (#6f9bdc, darker wainscot #4f78bd), a 3-cube floor of 2 x 2 checker tiles (#cf9f66, #b98450), and props made of cubes: window with a night city, moon and string lights, clock, shelf, desk, laptop, lamp, plant. Tint cubes warm near the lamp and cool in a moonlight patch on the floor. Cache the room per canvas size. Every call, voxelise the figure from pose(t): fill each limb capsule, the torso and the head with cubes, using joint z times 26 for depth, merge them into one set with colours by body part (jeans #26306e, hoodie #ff6b4a, skin, dark hair, teal headphone cups, cream sneakers with orange toes). Sort by i+j+k and draw only exposed faces: top x1.14, left x0.84, right x0.6, with a 1 px edge. The laptop display is 28 x 22 small cubes: code bars, then green with a check and SHIPPED. At 2.8 add a floor light ring, floating confetti cubes, and let the hop move in cube steps.
