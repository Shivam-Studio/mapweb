# Public GitHub Release Checklist

Before publishing the bundled map data to a public repository or live website:

- [ ] Confirm redistribution rights for the user-supplied `worldIndiaHigh` source SVG. Its metadata currently says to confirm redistribution rights.
- [ ] Review the ESRI-derived world map asset. Its current metadata says the license is not specified and admin review is required. Do not publish this asset publicly until its source/license is confirmed.
- [ ] Confirm the generated illustrative physical texture may be redistributed with the source boundary data.
- [ ] Choose a repository license for the application code. No license has been invented or added by this build.
- [ ] Decide whether map assets should be committed to GitHub or delivered separately as release assets if licensing/size requires it.
- [ ] Set up repository secrets only if future CI or deployment needs them; this MVP currently runs locally.
- [ ] Test clean installation on Windows after the local database backup/migration.
