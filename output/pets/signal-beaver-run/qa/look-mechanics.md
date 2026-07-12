# Signal Beaver look mechanics

## Natural motion

Signal Beaver looks around primarily by turning and pitching the separate rounded head while keeping both feet and the lower torso anchored. The small dark eyes lead, the muzzle and nose follow as one rigid facial unit, then the ears, upper torso, tail, and green wireless arcs follow subtly. The teeth and blue braces stay attached to the muzzle and retain their exact construction.

The eyes are flat mascot features rather than exposed eyeballs: their dark centers may shift slightly within the original eye design, while eyelids and head orientation do most of the directional work. The large paddle tail remains attached behind the torso, changes occlusion gradually with yaw, and never flips sides between adjacent poses. The three wireless arcs remain attached visually above the head, follow the head by a restrained amount, and keep their shape and green palette.

## Stable anchors and motion budget

- Both feet, the lower belly, body height, and baseline remain stable.
- Each 22.5-degree step changes head yaw or pitch, eye placement, muzzle projection, ear visibility, upper-torso follow-through, and tail occlusion by a small even amount.
- No whole-sprite rotation, skew, scale pop, lateral slide, detached effects, new props, or replacement eyes.
- Teeth, braces, nose, belly patch, outline weight, palette, and signal arcs remain identity-locked.

## Cardinal pose families

- `000 up`: chin and muzzle pitch upward; pupils and nose aim above center; more lower muzzle is visible; ears remain balanced; upper torso lengthens slightly; tail stays grounded behind the body.
- `090 screen-right`: head and muzzle yaw toward the image's right edge; nose tip and pupils sit right of head center; the screen-left cheek becomes more visible and the screen-right cheek compresses; the far ear is partly occluded; torso follows slightly; tail relationship changes continuously without detaching.
- `180 down`: chin and muzzle tuck toward the belly; pupils and nose aim below center; upper muzzle and brow become more visible; ears stay balanced; torso compresses slightly while feet remain fixed.
- `270 screen-left`: head and muzzle yaw toward the image's left edge; nose tip and pupils sit left of head center; the screen-right cheek becomes more visible and the screen-left cheek compresses; the far ear is partly occluded; torso follows slightly; tail remains continuously attached.

Diagonals interpolate these families evenly in clockwise order. The final `337.5` pose lands one equal step before `000`, with no reversal or registration jump.
