.pragma library

// Real-time solar system geometry.
//
// Planet positions: JPL "Approximate Positions of the Major Planets"
// (Standish), Table 1 Keplerian elements, valid 1800-2050 AD, J2000 ecliptic.
// Rotation rates: IAU WGCCRE 2015 report (prime meridian W).
// Moon: low-precision lunar theory (Meeus / Astronomical Almanac), ~0.3 deg.
//
// Positions are in the J2000 ecliptic frame: x = vernal equinox, z = ecliptic north.

var DEG = Math.PI / 180
var OBLIQUITY = 23.43928 * DEG

// a [AU], e, I, L, longitude of perihelion, longitude of node [deg]; then rates per Julian century
var ELEMENTS = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
            0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus:   [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
            0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  earth:   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
            0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars:    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
            0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
            -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn:  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
            -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  uranus:  [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
            -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
            0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.05010677]
}

// IAU rotation: [alpha0, alpha rate/cy, delta0, delta rate/cy, W0, W rate/day]
var ROTATION = {
  sun:     [286.13, 0, 63.87, 0, 84.176, 14.1844000],
  mercury: [281.0103, -0.0328, 61.4155, -0.0049, 329.5988, 6.1385108],
  venus:   [272.76, 0, 67.16, 0, 160.20, -1.4813688],
  earth:   [0.00, -0.641, 90.00, -0.557, 190.147, 360.9856235],
  moon:    [269.9949, 0.0031, 66.5392, 0.0130, 38.3213, 13.17635815],
  mars:    [317.68143, -0.1061, 52.88650, -0.0609, 176.630, 350.89198226],
  jupiter: [268.056595, -0.006499, 64.495303, 0.002413, 284.95, 870.5360000],
  saturn:  [40.589, -0.036, 83.537, -0.004, 38.90, 810.7939024],
  uranus:  [257.311, 0, -15.175, 0, 203.81, -501.1600928],
  neptune: [299.36, 0, 43.46, 0, 249.978, 541.1397757]
}

// Mean radii in km
var RADIUS_KM = {
  sun: 695700, mercury: 2439.4, venus: 6051.8, earth: 6371.0, moon: 1737.4, mars: 3389.5,
  jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622
}

// Days since J2000.0 (TT ~ UTC + 69 s)
function daysSinceJ2000(ms) {
  return (ms + 69184) / 86400000 + 2440587.5 - 2451545.0
}

function wrap180(deg) {
  var x = ((deg + 180) % 360 + 360) % 360
  return x - 180
}

function elementsAt(name, d) {
  var el = ELEMENTS[name], T = d / 36525
  return {
    a: el[0] + el[6] * T, e: el[1] + el[7] * T, I: el[2] + el[8] * T,
    L: el[3] + el[9] * T, wbar: el[4] + el[10] * T, node: el[5] + el[11] * T
  }
}

// Position in the orbit plane, rotated into the ecliptic (AU)
function orbitPoint(k, E) {
  var xp = k.a * (Math.cos(E) - k.e)
  var yp = k.a * Math.sqrt(1 - k.e * k.e) * Math.sin(E)
  var w = (k.wbar - k.node) * DEG, O = k.node * DEG, I = k.I * DEG
  var cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I)
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    (sw * sI) * xp + (cw * sI) * yp
  ]
}

function solveKepler(Mdeg, e) {
  var M = wrap180(Mdeg) * DEG
  var E = M + e * Math.sin(M)
  for (var i = 0; i < 12; i++) {
    var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-12) break
  }
  return E
}

// Heliocentric J2000 ecliptic position in AU
function planetEcliptic(name, d) {
  var k = elementsAt(name, d)
  return orbitPoint(k, solveKepler(k.L - k.wbar, k.e))
}

// Full orbit as a list of ecliptic points (AU)
function orbitPath(name, d, segments) {
  var k = elementsAt(name, d), out = []
  for (var i = 0; i <= segments; i++) out.push(orbitPoint(k, 2 * Math.PI * i / segments))
  return out
}

// Geocentric Moon: ecliptic direction (unit vector) and distance in km
function moonGeocentric(d) {
  var T = d / 36525
  var Lp = 218.3164477 + 481267.88123421 * T
  var D  = 297.8501921 + 445267.1114034 * T
  var M  = 357.5291092 + 35999.0502909 * T
  var Mp = 134.9633964 + 477198.8675055 * T
  var F  = 93.2720950 + 483202.0175233 * T
  var s = function(x) { return Math.sin(x * DEG) }
  var c = function(x) { return Math.cos(x * DEG) }
  var lon = Lp + 6.288774 * s(Mp) + 1.274027 * s(2 * D - Mp) + 0.658314 * s(2 * D)
          + 0.213618 * s(2 * Mp) - 0.185116 * s(M) - 0.114332 * s(2 * F)
          + 0.058793 * s(2 * D - 2 * Mp) + 0.057066 * s(2 * D - M - Mp)
          + 0.053322 * s(2 * D + Mp) + 0.045758 * s(2 * D - M)
  var lat = 5.128122 * s(F) + 0.280602 * s(Mp + F) + 0.277693 * s(Mp - F)
          + 0.173237 * s(2 * D - F) + 0.055413 * s(2 * D - Mp + F) + 0.046271 * s(2 * D - Mp - F)
  var dist = 385000.56 - 20905.355 * c(Mp) - 3699.111 * c(2 * D - Mp) - 2955.968 * c(2 * D)
           - 569.925 * c(2 * Mp)
  // Precess from ecliptic of date back to J2000 (longitude only, adequate here)
  lon -= 1.396971 * T
  var cl = Math.cos(lat * DEG)
  return { dir: [cl * Math.cos(lon * DEG), cl * Math.sin(lon * DEG), Math.sin(lat * DEG)], km: dist }
}
