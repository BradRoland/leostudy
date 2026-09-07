# Blender avatar collection

Seven original procedural collectibles are modeled and rendered in Blender. Edition 3 adds recognizable role silhouettes, layered uniform construction, engraved badges, equipment and small material details. There are no AI-generated images, external textures or third-party character assets.

| Saved key | Collectible | Level | Modeled role details | Editable model |
| --- | --- | --- | --- | --- |
| academy | Police Cadet | 1 | Peaked cap, numbered police shields, shoulder radio, stitched pockets, utility belt and polished boots | art/avatars/patrol.blend |
| orbit | K9 Sentinel | 3 | German shepherd ears and muzzle, amber eyes, sculpted cheek fur, reflective police K9 harness, toe grooves and working lead | art/avatars/k9.blend |
| summit | Highway Patrol | 5 | White motorcycle helmet, police motorcycle fairing, chrome forks, headlamp, emergency lights, mirrors and front wheel | art/avatars/motor.blend |
| bloom | Major Crimes Detective | 10 | Camel fedora and trench coat, tie, notched lapels, brass magnifier, spiral-bound evidence notebook, pen and case tab | art/avatars/detective.blend |
| compass | Helicopter Pilot | 20 | Olive flight suit, fitted helmet stripe, communication headset, flight harness and miniature police helicopter with both rotors and landing skids | art/avatars/aviation.blend |
| nova | Watch Commander | 35 | Brass cap trim, visor oak leaves, rank details, service ribbons, ceremonial shoulder cord and command tablet | art/avatars/commander.blend |
| legacy | Honor Guard Eagle | 50 | Layered wing and neck feathers, hooked beak, separate talons, gold laurels and an enamel honor shield | art/avatars/guardian.blend |

Existing saved keys and unlock levels are preserved. Uploaded user photos remain supported. Police Cadet is the default profile image. Selecting an earned collectible previews it; Save profile uploads the selected WebP through the same authenticated avatar storage flow as an uploaded photo. Existing saved profile images are not replaced automatically.

## Rebuild

Validated with Blender 5.2.1 LTS. From the web project directory:

```sh
blender -b --python scripts/art/render_academy_avatars.py -- /tmp/academy-blender-avatars-v3
```

Optional model names after the output directory limit rendering to those models. The script saves a compressed editable `.blend` and a 768-pixel PNG per model, using 64 Cycles samples and denoising. File backup copies are disabled for reproducible builds. Geometry, editable text, lighting, materials and the camera are saved in each model; there are no external asset dependencies.

The shipped web assets are 512-pixel WebP files converted with `cwebp -q 92 -resize 512 512`, under `public/reward-avatars/`. All seven shipped images total 139,612 bytes (about 136 KiB). Versioned `*-v3.webp` filenames prevent stale browser caches. Keep the editable models under `art/avatars/` and retain old image assets so previously saved selections continue to load.

## Verification

Inspect all seven renders at portrait and thumbnail sizes. Check role props, seams, badge lettering, silhouette clarity and camera framing. The detective's magnifier and notebook and the pilot's helicopter should read without relying on the label below the image.

`node backend/staging-blender-avatars-check.mjs` uses disposable development accounts to verify every image loads, level restrictions, selection, a real storage upload, saved profile reload and mobile overflow. Set `ACADEMY_CHECK_ORIGIN=https://dev.180.academy` to run the same browser checks against the deployed development site. The database relay is explicitly restricted to the development clone; fixtures and uploaded files are cleaned up.
