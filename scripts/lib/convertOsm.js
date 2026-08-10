// Pure conversion logic, extracted from scripts/convert-survey-osm.mjs so
// api/admin.js (the in-app "update from OpenStreetMap" admin feature) can
// run the exact same logic against an uploaded export as the CLI script
// runs against a local file, with zero duplicated logic to drift apart.
// Takes the raw Overpass `elements` array in, returns plain data out --
// no filesystem access here, that stays in the CLI script's thin wrapper.

const ALLOWED_CATEGORIES = ['faculty', 'hostel', 'admin', 'eatery', 'atm', 'landmark', 'service', 'health', 'sport'];
const SNAP_METERS = 2; // defensive-only: OSM topology should already be exact

export function haversineLngLat([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function mapCategory(tags) {
  const t = tags ?? {};
  if (t.amenity === 'university' || t.amenity === 'college' || t.building === 'university' || t.building === 'college') {
    return { category: 'faculty' };
  }
  if (t.building === 'dormitory' || t.building === 'hostel' || t.amenity === 'dormitory') return { category: 'hostel' };
  if (t.amenity === 'atm') return { category: 'atm' };
  if (t.amenity === 'bank') return { category: 'service', flag: 'amenity=bank without atm=yes — atm or admin? verify', categoryAmbiguous: true };
  if (['restaurant', 'cafe', 'fast_food', 'food_court'].includes(t.amenity) || ['convenience', 'supermarket', 'bakery'].includes(t.shop)) {
    return { category: 'eatery' };
  }
  if (['pitch', 'sports_centre', 'stadium', 'track'].includes(t.leisure) || t.sport) return { category: 'sport' };
  if (['clinic', 'hospital', 'doctors', 'pharmacy'].includes(t.amenity) || t.healthcare) return { category: 'health' };
  if (t.office === 'government' || t.amenity === 'townhall' || t.building === 'civic' || t.office) return { category: 'admin' };
  if (['police', 'toilets', 'fuel', 'marketplace'].includes(t.amenity) || t.shop) return { category: 'service' };
  if (t.amenity === 'place_of_worship' || t.tourism || t.historic) return { category: 'landmark' };
  return null;
}

function inferFromName(name) {
  const found = ALLOWED_CATEGORIES.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(name));
  return found.length === 1 ? found[0] : null;
}

function aliasesFromTags(tags) {
  const t = tags ?? {};
  return [t.alt_name, t.old_name, t.short_name]
    .filter(Boolean)
    .flatMap((v) => v.split(';'))
    .map((s) => s.trim())
    .filter(Boolean)
    .join(';');
}

export function convertOsmExport(elements) {
  const nodesById = new Map();
  const waysById = new Map();
  const relationsSkipped = [];

  for (const el of elements) {
    if (el.type === 'node') nodesById.set(el.id, el);
    else if (el.type === 'way') waysById.set(el.id, el);
    else if (el.type === 'relation') relationsSkipped.push(el.id);
  }

  const places = [];
  const flaggedPlaces = [];
  let unnamedBuildingsSkipped = 0;

  function centroidOfWay(way) {
    const ids = way.nodes ?? [];
    const closed = ids.length > 1 && ids[0] === ids[ids.length - 1];
    const usable = closed ? ids.slice(0, -1) : ids;
    const coords = usable.map((id) => nodesById.get(id)).filter(Boolean);
    if (!coords.length) return null;
    const lat = coords.reduce((s, n) => s + n.lat, 0) / coords.length;
    const lon = coords.reduce((s, n) => s + n.lon, 0) / coords.length;
    return { lat, lon };
  }

  function considerPlace({ tags, lat, lon, sourceKind, sourceId }) {
    const name = (tags.name ?? '').trim();
    const description = tags.description ?? tags.note ?? '';
    const aliases = aliasesFromTags(tags);

    let mapped = mapCategory(tags);
    let categoryInferred = false;

    if (!mapped) {
      if (tags.building) {
        if (!name) {
          unnamedBuildingsSkipped++;
          return;
        }
        const inferred = name ? inferFromName(name) : null;
        if (inferred) {
          mapped = { category: inferred };
          categoryInferred = true;
        } else {
          mapped = { category: 'landmark', flag: 'unmapped generic building, needs a category — defaulted to landmark, verify' };
        }
      } else if (name) {
        const inferred = inferFromName(name);
        mapped = inferred ? { category: inferred } : { category: 'landmark', flag: 'no recognized category tags, defaulted to landmark' };
        categoryInferred = !!inferred;
      } else {
        return;
      }
    }

    if (!name) {
      flaggedPlaces.push({ sourceKind, sourceId, reason: 'missing name', tags });
      return;
    }

    const entry = { name, category: mapped.category, aliases, description, lat, lng: lon };
    places.push(entry);

    if (mapped.flag) {
      flaggedPlaces.push({ name, sourceKind, sourceId, reason: mapped.flag, categoryAmbiguous: !!mapped.categoryAmbiguous });
    }
    if (categoryInferred) {
      flaggedPlaces.push({ name, sourceKind, sourceId, reason: `category inferred from name ("${mapped.category}") — verify` });
    }
  }

  const buildingFeatures = [];
  for (const way of waysById.values()) {
    if (!way.tags?.building) continue;
    const ids = way.nodes ?? [];
    if (ids.length < 4 || ids[0] !== ids[ids.length - 1]) continue;
    const ring = ids
      .map((id) => nodesById.get(id))
      .filter(Boolean)
      .map((n) => [n.lon, n.lat]);
    if (ring.length >= 4) {
      buildingFeatures.push({
        type: 'Feature',
        properties: { name: way.tags.name ?? null },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
    const c = centroidOfWay(way);
    if (!c) continue;
    considerPlace({ tags: way.tags, lat: c.lat, lon: c.lon, sourceKind: 'way', sourceId: way.id });
  }

  for (const node of nodesById.values()) {
    if (!node.tags) continue;
    if (node.tags.building) continue;
    const hasCategoryTag = ['amenity', 'shop', 'office', 'leisure', 'healthcare', 'tourism'].some((k) => node.tags[k]);
    if (!hasCategoryTag) continue;
    considerPlace({ tags: node.tags, lat: node.lat, lon: node.lon, sourceKind: 'node', sourceId: node.id });
  }

  const PATH_TYPE_BY_HIGHWAY = {
    footway: 'walkway',
    path: 'walkway',
    pedestrian: 'walkway',
    living_street: 'walkway',
    steps: 'stairs',
    service: 'road',
    residential: 'road',
    track: 'road',
    unclassified: 'road',
    tertiary: 'road',
    secondary: 'road',
    primary: 'road',
  };

  const pathWays = [...waysById.values()].filter((w) => w.tags?.highway && w.nodes?.length > 1);
  const usedNodeIds = [...new Set(pathWays.flatMap((w) => w.nodes))].filter((id) => nodesById.has(id));

  const parent = usedNodeIds.map((_, i) => i);
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i, j) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  for (let i = 0; i < usedNodeIds.length; i++) {
    const a = nodesById.get(usedNodeIds[i]);
    for (let j = i + 1; j < usedNodeIds.length; j++) {
      const b = nodesById.get(usedNodeIds[j]);
      if (haversineLngLat([a.lon, a.lat], [b.lon, b.lat]) <= SNAP_METERS) union(i, j);
    }
  }

  const clusterMembers = new Map();
  usedNodeIds.forEach((_, i) => {
    const root = find(i);
    if (!clusterMembers.has(root)) clusterMembers.set(root, []);
    clusterMembers.get(root).push(i);
  });

  const osmIdToLocalId = new Map();
  const localNodeCoords = [];
  for (const members of clusterMembers.values()) {
    const lat = members.reduce((s, i) => s + nodesById.get(usedNodeIds[i]).lat, 0) / members.length;
    const lon = members.reduce((s, i) => s + nodesById.get(usedNodeIds[i]).lon, 0) / members.length;
    const localId = localNodeCoords.length + 1;
    localNodeCoords.push([Number(lon.toFixed(7)), Number(lat.toFixed(7))]);
    for (const i of members) osmIdToLocalId.set(usedNodeIds[i], localId);
  }

  const nodesMergedByDefensiveSnap = usedNodeIds.length - clusterMembers.size;

  const edges = [];
  const seenPairs = new Set();
  let degenerateCount = 0;
  let unrecognizedHighwayCount = 0;

  for (const way of pathWays) {
    let pathType = PATH_TYPE_BY_HIGHWAY[way.tags.highway];
    if (!pathType) {
      pathType = 'walkway';
      unrecognizedHighwayCount++;
    }
    const localIds = way.nodes.map((id) => osmIdToLocalId.get(id)).filter((id) => id != null);
    for (let p = 0; p < localIds.length - 1; p++) {
      const source = localIds[p];
      const target = localIds[p + 1];
      if (source === target) {
        degenerateCount++;
        continue;
      }
      const key = source < target ? `${source}-${target}` : `${target}-${source}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      edges.push({ source, target, pathType });
    }
  }

  const nodes = localNodeCoords.map((coord, idx) => ({ id: idx + 1, lng: coord[0], lat: coord[1] }));
  const totalLengthM = edges.reduce(
    (s, e) => s + haversineLngLat([nodes[e.source - 1].lng, nodes[e.source - 1].lat], [nodes[e.target - 1].lng, nodes[e.target - 1].lat]),
    0,
  );

  return {
    places,
    buildingFeatures,
    nodes,
    edges: edges.map((e) => ({ source: e.source, target: e.target, path_type: e.pathType })),
    report: {
      places: { written: places.length, flagged: flaggedPlaces, unnamedBuildingsSkipped },
      buildingFootprints: buildingFeatures.length,
      network: {
        nodes: nodes.length,
        edges: edges.length,
        degenerateEdgesSkipped: degenerateCount,
        nodesMergedByDefensiveSnap,
        unrecognizedHighwayDefaultedToWalkway: unrecognizedHighwayCount,
        totalLengthMeters: Math.round(totalLengthM),
      },
      relationsSkipped: relationsSkipped.length,
    },
  };
}
