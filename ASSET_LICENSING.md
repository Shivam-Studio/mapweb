# Map asset licensing and attribution

## Bundled boundary maps

The original nine political/physical starter map packs in `storage/maps/` derive their editable country boundaries from the user-supplied `worldIndiaHigh(1).svg` asset, which is identified in the SVG as amCharts world geodata. amCharts states that free individual SVG maps may be used under CC BY 4.0 with attribution. The original “Map by amCharts” hyperlink is preserved in the SVGs and a visible source credit is shown in MapMotion Studio. See `storage/maps/ATTRIBUTION.md` and https://amcharts.com/svg-maps/download/.

## Physical relief

The generated terrain textures are illustrative relief artwork for visualization only. They are not measured DEM/elevation data and are not satellite imagery.

## Satellite imagery

The `world-satellite-india-view/` starter map includes the satellite raster embedded in the user-supplied SVG, plus a separate user-supplied physical PNG. No third-party source or redistribution license was supplied for those two assets; verify permission before redistributing them publicly. For any additional satellite imagery, only include assets you own or are licensed to use, and retain the source attribution.

## User uploads

User uploads are ignored by Git by default. Do not commit customer/private map packs, paid third-party map files, or raw imagery unless you have explicit redistribution rights.


## India state / Union Territory boundaries used by Global Position AutoPlacer (0.8.8)

- Source: geoBoundaries India ADM1, pinned commit `9469f09592ced973a3448cf66b6100b741b64c0d`.
- Source metadata reports 36 state / UT features and represented boundary year 2011.
- Licence: Creative Commons Attribution 2.5 India (CC BY 2.5 IN): https://creativecommons.org/licenses/by/2.5/in/
- Dataset metadata: https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/
- Attribute geoBoundaries and its listed source contributors in redistributions and derived outputs.
