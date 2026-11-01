# Global Position AutoPlacer — MapMotion Studio 0.8.9

## What it does

The AutoPlacer converts India ADM1 state / Union Territory polygon geometry from WGS84 longitude/latitude into the pixel coordinate frame of a target map crop. It exports a transparent PNG that is the same pixel width and height as the reference crop, so it can be composited above that crop in Alight Motion without manually repositioning the selected state.

## Registration modes

### Geographic bounds

Choose World, Asia, South Asia, India, India + neighbours, or Custom. Presets are standard geographic extents, not image recognition; they align only when the base image uses the same projection and exact bounds. For an arbitrary third-party crop, use its actual west, south, east and north bounds or use three-point calibration. Choose the same projection used by the base map:

- `EPSG:3857`: WGS84 Web Mercator; longitudes and latitudes are projected before scaling to the crop frame.
- `EPSG:4326`: equirectangular longitude/latitude; X and Y are linear in degrees.

This mode is exact only when the target image uses the selected projection and the exact geographic bounds entered. If the source has trim margins, a legend, non-map padding, or a slightly different crop, the map bounds need to account for the actual image frame.

### Three-point calibration

Choose **Unknown crop — 3-point calibration** and upload the exact reference crop. Enter longitude and latitude for three recognizable locations (for example, city centres or graticule intersections). Select a control point in the dropdown and click its location on the reference-image preview; MapMotion records pixel X/Y relative to the original image dimensions. Repeat for all three points. X/Y can also be entered manually.

The engine fits a two-dimensional affine transform in the selected projection. The transform exactly matches the three selected points and is useful for a local crop with modest distortion. It is not a general-purpose image-to-map AI solver; a strongly curved projection or a large region may need a proper reprojection or a smaller local crop.

## Export package

The ZIP contains:

- `<state>-at-crop-position.png`: transparent overlay on the full target canvas; only the selected state geometry is visible.
- `placement.json`: selected state identity, canvas dimensions, projection, geographic bounds or calibration points, transform coefficients and import alignment instructions.
- `IMPORT-INSTRUCTIONS.txt`: Alight Motion import steps.

Keep the overlay and base map at the exact same canvas dimensions. Place both layers at the composition centre, scale 100%, rotation 0°, and do not independently crop or resize only one layer.

## Important boundary and projection limitations

- The dataset is geoBoundaries **India ADM1** (state / Union Territory). Its API metadata reports 36 administrative units and a represented boundary year of **2011**. Verify newer administrative changes for time-sensitive work.
- The dataset source metadata lists the source as the DataMeet India community and Election Commission of India, and the licence as **Creative Commons Attribution 2.5 India (CC BY 2.5 IN)**. Retain attribution when distributing derived outputs.
- The geometry is fetched from a pinned geoBoundaries commit through the same-origin FastAPI endpoint, validated as a 36-feature GeoJSON collection, and cached in the function runtime for one day. A direct Git LFS media request is retained as a browser fallback. If both delivery paths are unavailable, the state dropdown shows a retry control and leaves the rest of MapMotion usable.
- A map image alone does not reveal its projection and exact geographic extent. Unknown third-party crops need bounds or control points. There is no mathematically reliable way to guarantee exact placement from arbitrary pixels without a geographic reference.
- The user's existing supplied India/world SVGs have no verified projection declaration. The AutoPlacer does not silently assume those assets are georeferenced.

## Data source and attribution

geoBoundaries, India ADM1, pinned release commit `9469f09592ced973a3448cf66b6100b741b64c0d`. Dataset API metadata: <https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/>. Licence: <https://creativecommons.org/licenses/by/2.5/in/>.
