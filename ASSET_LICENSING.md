# Map asset licensing and attribution

The public source repository contains the application code only. Development map packs are intentionally excluded because the source metadata does not establish public redistribution rights for all map and satellite imagery.

Before adding a map pack to a public repository or hosted application:

1. Verify the original boundary-data source and its redistribution licence.
2. Verify the imagery provider's terms, required attribution and redistribution permissions separately from the boundary SVG.
3. Record source, licence, attribution text and any usage restrictions in that map's `metadata.json`.
4. Keep assets with unknown or non-redistributable terms outside the public repository.

MapMotion Studio's upload workflow preserves user-provided SVG data locally; uploading a map into a local installation does not grant permission to redistribute it.
