# Blender avatar collection

Seven original procedural models replace the earned collection artwork. These are Blender meshes and materials rendered with Cycles, with no AI-generated images, external textures or licensed character assets.

| Saved key | Collectible | Level | Editable model |
| --- | --- | --- | --- |
| academy | Patrol Cadet | 1 | art/avatars/patrol.blend |
| orbit | K9 Partner | 3 | art/avatars/k9.blend |
| summit | Motor Unit | 5 | art/avatars/motor.blend |
| bloom | Detective | 10 | art/avatars/detective.blend |
| compass | Air Support | 20 | art/avatars/aviation.blend |
| nova | Watch Commander | 35 | art/avatars/commander.blend |
| legacy | Guardian | 50 | art/avatars/guardian.blend |

Existing saved keys and unlock levels are preserved. Uploaded user photos remain supported. Patrol Cadet is the new default profile image. Selecting an earned collectible previews it; Save profile uploads the selected WebP through the same authenticated avatar storage flow as an uploaded photo.

## Rebuild

Validated with Blender 5.2.1 LTS. From the web project directory:

```sh
blender -b --python scripts/art/render_academy_avatars.py -- /tmp/academy-blender-avatars
```

Optional model names after the output directory limit rendering to those models. The script saves a compressed editable `.blend` and a 768-pixel PNG per model. The shipped web assets are 512-pixel WebP files, converted with `cwebp -q 90 -resize 512 512`, under `public/reward-avatars/`. All seven images together are approximately 100 KB. Keep the editable models under `art/avatars/` and preserve the versioned public filenames when replacing assets to avoid stale browser caches.

## Verification

`node backend/staging-blender-avatars-check.mjs` uses disposable development accounts to verify every image loads, level restrictions, selection, a real storage upload, saved profile reload and mobile overflow. Set `ACADEMY_CHECK_ORIGIN=https://dev.180.academy` to run the same browser checks against the deployed development site. The database relay is explicitly restricted to the development clone; fixtures and uploaded files are cleaned up.
