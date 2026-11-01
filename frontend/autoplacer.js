/* MapMotion Studio Global Position AutoPlacer geometry engine.
 * Coordinates are WGS84 lon/lat, projected into the selected reference frame,
 * then mapped into the exact pixel rectangle used by the user's crop image.
 */
(function (root) {
  'use strict';
  const MAX_MERCATOR_LAT = 85.0511287798066;

  function mercator(lon, lat) {
    const safeLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, Number(lat)));
    const phi = safeLat * Math.PI / 180;
    return [Number(lon) * Math.PI / 180, Math.log(Math.tan(Math.PI / 4 + phi / 2))];
  }

  function projectCoordinate(lon, lat, projection) {
    if (projection === 'EPSG:4326') return [Number(lon), Number(lat)];
    return mercator(lon, lat);
  }

  function geographicProjector(bounds, width, height, projection) {
    const west = Number(bounds.west), eastRaw = Number(bounds.east);
    const south = Number(bounds.south), north = Number(bounds.north);
    if (![west, eastRaw, south, north, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || north <= south) {
      throw new Error('Enter valid crop bounds and canvas dimensions.');
    }
    let east = eastRaw;
    if (east <= west) east += 360;
    const [left, bottom] = projectCoordinate(west, south, projection);
    const [right, top] = projectCoordinate(east, north, projection);
    if (!(right > left) || !(top > bottom)) throw new Error('Crop bounds must span a valid geographic area.');
    return function (lon, lat) {
      let adjustedLon = Number(lon);
      if (east > 180 && adjustedLon < west) adjustedLon += 360;
      if (west < -180 && adjustedLon > east) adjustedLon -= 360;
      const [x, y] = projectCoordinate(adjustedLon, Number(lat), projection);
      return [(x - left) / (right - left) * width, (top - y) / (top - bottom) * height];
    };
  }

  function solve3x3(matrix, vector) {
    const a = matrix.map((row, i) => [...row, vector[i]]);
    for (let col = 0; col < 3; col++) {
      let pivot = col;
      for (let row = col + 1; row < 3; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('Calibration points are collinear. Pick three well-separated points.');
      [a[col], a[pivot]] = [a[pivot], a[col]];
      const divisor = a[col][col];
      for (let j = col; j < 4; j++) a[col][j] /= divisor;
      for (let row = 0; row < 3; row++) {
        if (row === col) continue;
        const factor = a[row][col];
        for (let j = col; j < 4; j++) a[row][j] -= factor * a[col][j];
      }
    }
    return [a[0][3], a[1][3], a[2][3]];
  }

  function affineProjector(controlPoints, projection) {
    if (!Array.isArray(controlPoints) || controlPoints.length !== 3) throw new Error('Exactly three calibration points are required.');
    const projected = controlPoints.map(p => {
      const [gx, gy] = projectCoordinate(p.lon, p.lat, projection);
      const px = Number(p.x), py = Number(p.y);
      if (![gx, gy, px, py].every(Number.isFinite)) throw new Error('Enter longitude, latitude, X and Y for all three control points.');
      return { gx, gy, px, py };
    });
    const matrix = projected.map(p => [p.gx, p.gy, 1]);
    const ax = solve3x3(matrix, projected.map(p => p.px));
    const ay = solve3x3(matrix, projected.map(p => p.py));
    const fn = (lon, lat) => {
      const [gx, gy] = projectCoordinate(lon, lat, projection);
      return [ax[0] * gx + ax[1] * gy + ax[2], ay[0] * gx + ay[1] * gy + ay[2]];
    };
    fn.coefficients = { x: ax, y: ay };
    return fn;
  }

  function ringPath(ring, project) {
    if (!Array.isArray(ring) || ring.length < 3) return '';
    const points = ring.map(pair => project(pair[0], pair[1]));
    if (points.some(p => !p || !p.every(Number.isFinite))) return '';
    return 'M' + points.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L') + 'Z';
  }

  function geometryToSvgPath(geometry, project) {
    if (!geometry || !geometry.coordinates) return '';
    const paths = [];
    const addPolygon = polygon => {
      for (const ring of polygon || []) {
        const path = ringPath(ring, project);
        if (path) paths.push(path);
      }
    };
    if (geometry.type === 'Polygon') addPolygon(geometry.coordinates);
    else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(addPolygon);
    else if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(g => paths.push(geometryToSvgPath(g, project)));
    return paths.filter(Boolean).join('');
  }

  function normalizeFeature(feature) {
    const p = feature?.properties || {};
    return {
      name: p.shapeName || p.name || p.shapeNameEN || p.shapeGroup || 'Unnamed region',
      code: p.shapeISO || p.shapeID || feature.id || '',
      year: p.shapeYear || p.boundaryYearRepresented || '2011',
      geometry: feature?.geometry,
      sourceProperties: p
    };
  }

  const api = { MAX_MERCATOR_LAT, mercator, projectCoordinate, geographicProjector, solve3x3, affineProjector, geometryToSvgPath, normalizeFeature };
  root.MapMotionAutoPlacer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
