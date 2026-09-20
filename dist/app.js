const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const EXPAND = {
  "ㄲ":["ㄱ","ㄱ"], "ㄸ":["ㄷ","ㄷ"], "ㅃ":["ㅂ","ㅂ"], "ㅆ":["ㅅ","ㅅ"], "ㅉ":["ㅈ","ㅈ"],
  "ㄳ":["ㄱ","ㅅ"], "ㄵ":["ㄴ","ㅈ"], "ㄶ":["ㄴ","ㅎ"], "ㄺ":["ㄹ","ㄱ"], "ㄻ":["ㄹ","ㅁ"],
  "ㄼ":["ㄹ","ㅂ"], "ㄽ":["ㄹ","ㅅ"], "ㄾ":["ㄹ","ㅌ"], "ㄿ":["ㄹ","ㅍ"], "ㅀ":["ㄹ","ㅎ"], "ㅄ":["ㅂ","ㅅ"],
  "ㅐ":["ㅏ","ㅣ"], "ㅒ":["ㅑ","ㅣ"], "ㅔ":["ㅓ","ㅣ"], "ㅖ":["ㅕ","ㅣ"],
  "ㅘ":["ㅗ","ㅏ"], "ㅙ":["ㅗ","ㅏ","ㅣ"], "ㅚ":["ㅗ","ㅣ"], "ㅝ":["ㅜ","ㅓ"],
  "ㅞ":["ㅜ","ㅓ","ㅣ"], "ㅟ":["ㅜ","ㅣ"], "ㅢ":["ㅡ","ㅣ"]
};

const SVG_NS = "http://www.w3.org/2000/svg";
const input = document.querySelector("#name-input");
const fontSvg = document.querySelector("#font-svg");
const vaseSvg = document.querySelector("#vase-svg");
const emptyFont = document.querySelector("#empty-font");
const emptyObject = document.querySelector("#empty-object");
const unsupportedLine = document.querySelector("#unsupported");

let fontData = null;

function svgEl(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function resolveToken(token, available) {
  if (available.has(token)) return [token];
  return EXPAND[token] || [token];
}

function addGroup(layout, rawToken, advanceAfter, available) {
  const parts = resolveToken(rawToken, available);
  parts.forEach((token, index) => {
    layout.push({ token, advance: index === parts.length - 1 ? advanceAfter : 1 });
  });
}

function makeSyllableLayout(value) {
  const available = new Set(fontData.glyphOrder);
  const shared = new Set(fontData.layoutRules?.sharedCodaVowels || []);
  const allJamo = new Set([...CHO, ...JUNG, ...JONG]);
  const layout = [];
  const unsupported = [];

  for (const character of String(value || "").normalize("NFC")) {
    const code = character.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const syllable = code - 0xac00;
      const choIndex = Math.floor(syllable / 588);
      const jungIndex = Math.floor((syllable % 588) / 28);
      const jongIndex = syllable % 28;

      addGroup(layout, CHO[choIndex], 1, available);
      const medialParts = resolveToken(JUNG[jungIndex], available);
      const sharesWithFinal = jongIndex !== 0 && shared.has(medialParts.at(-1));
      addGroup(layout, JUNG[jungIndex], sharesWithFinal ? 0 : 1, available);
      if (jongIndex !== 0) addGroup(layout, JONG[jongIndex], 1, available);
    } else if (allJamo.has(character)) {
      addGroup(layout, character, 1, available);
    } else if (/\s/.test(character)) {
      layout.push({ token: null, advance: 1 });
    } else {
      unsupported.push(character);
    }
  }
  return { layout, unsupported };
}

function translatePoint(point, dx, dy) {
  return [point[0] + dx, point[1] + dy, point[2] || 0];
}

function vectorError(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function fitJointPoint(point, sourceDelta, targetDelta, targetOrigin) {
  const sourceLength = Math.hypot(sourceDelta[0], sourceDelta[1]);
  const targetLength = Math.hypot(targetDelta[0], targetDelta[1]);
  if (sourceLength < 0.001) return translatePoint(point, targetOrigin[0], targetOrigin[1]);
  const rotation = Math.atan2(targetDelta[1], targetDelta[0]) - Math.atan2(sourceDelta[1], sourceDelta[0]);
  const scale = targetLength / sourceLength;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    targetOrigin[0] + scale * (point[0] * cos - point[1] * sin),
    targetOrigin[1] + scale * (point[0] * sin + point[1] * cos),
    point[2] || 0
  ];
}

function composeName(value) {
  const { layout, unsupported } = makeSyllableLayout(value);
  const curves = [];
  const glyphs = [];
  const joints = [];
  const unmatched = [];
  let slotIndex = 0;
  let previous = null;

  for (const item of layout) {
    if (!item.token) {
      slotIndex += item.advance;
      previous = null;
      continue;
    }

    const glyph = fontData.glyphs[item.token];
    if (!glyph) {
      unsupported.push(item.token);
      slotIndex += item.advance;
      previous = null;
      continue;
    }

    const dx = slotIndex * fontData.cellStep;
    const currentIn = translatePoint(glyph.in, dx, 0);
    const currentOut = translatePoint(glyph.out, dx, 0);
    const glyphRecord = { token: item.token, slot: slotIndex, advance: item.advance, in: currentIn, out: currentOut };

    glyph.curves.forEach((curve, curveIndex) => {
      curves.push({
        kind: "glyph",
        token: item.token,
        slot: slotIndex,
        curveIndex,
        points: curve.points.map(point => translatePoint(point, dx, 0))
      });
    });

    const sharesCellWithPrevious = previous && previous.slot === slotIndex;
    if (previous && !sharesCellWithPrevious) {
      const gap = [currentIn[0] - previous.out[0], currentIn[1] - previous.out[1]];
      const distance = Math.hypot(gap[0], gap[1]);
      if (distance > 0.1) {
        const ranked = fontData.jointOrder
          .map(id => ({ id, joint: fontData.joints[id], error: vectorError(gap, fontData.joints[id].delta) }))
          .sort((a, b) => a.error - b.error);
        const best = ranked[0];
        if (best) {
          const adapted = best.error > 0.5;
          best.joint.curves.forEach((curve, curveIndex) => {
            curves.push({
              kind: "joint",
              token: best.id,
              slot: previous.slot,
              curveIndex,
              adapted,
              points: curve.points.map(point => fitJointPoint(point, best.joint.delta, gap, previous.out))
            });
          });
          joints.push({ id: best.id, in: previous.out, out: currentIn, adapted });
        } else {
          unmatched.push({ from: previous.out, to: currentIn });
        }
      }
    }

    glyphs.push(glyphRecord);
    previous = glyphRecord;
    slotIndex += item.advance;
  }

  return { layout, unsupported: [...new Set(unsupported)], curves, glyphs, joints, unmatched, cellCount: slotIndex };
}

function pointsBounds(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return points.reduce((box, point) => ({
    minX: Math.min(box.minX, point[0]), minY: Math.min(box.minY, point[1]),
    maxX: Math.max(box.maxX, point[0]), maxY: Math.max(box.maxY, point[1])
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function linePath(points, mapper = point => point) {
  return points.map((point, index) => {
    const mapped = mapper(point);
    return `${index ? "L" : "M"}${mapped[0].toFixed(2)} ${mapped[1].toFixed(2)}`;
  }).join(" ");
}

function renderFont(assembly, name) {
  fontSvg.replaceChildren();
  if (!assembly.curves.length) {
    emptyFont.hidden = false;
    fontSvg.removeAttribute("viewBox");
    return;
  }
  emptyFont.hidden = true;

  const mappedPoints = assembly.curves.flatMap(curve => curve.points.map(([x, y]) => [x, -y]));
  const box = pointsBounds(mappedPoints);
  const padX = 24;
  const padY = 38;
  fontSvg.setAttribute("viewBox", `${box.minX - padX} ${box.minY - padY} ${box.maxX - box.minX + padX * 2} ${box.maxY - box.minY + padY * 2}`);
  fontSvg.setAttribute("aria-label", `${name}을 흘림 폰트로 조합한 선 이미지`);

  assembly.curves.forEach(curve => {
    fontSvg.append(svgEl("path", {
      d: linePath(curve.points, ([x, y]) => [x, -y]),
      class: `font-stroke ${curve.kind}`
    }));
  });

  assembly.joints.forEach(joint => {
    fontSvg.append(svgEl("circle", { cx: joint.in[0], cy: -joint.in[1], r: 2.3, class: "font-port" }));
  });
}

function iso([x, y], z = 0) {
  return [(x + y) * 0.8660254, (x - y) * 0.5 - z];
}

function polygonPath(points, z = 0, offsetY = 0) {
  return `${points.map((point, index) => {
    const [x, y] = iso(point, z);
    return `${index ? "L" : "M"}${x.toFixed(2)} ${(y + offsetY).toFixed(2)}`;
  }).join(" ")} Z`;
}

function baseSidePath(first, second, topZ = 0, bottomZ = -10) {
  const points = [iso(first, topZ), iso(second, topZ), iso(second, bottomZ), iso(first, bottomZ)];
  return `${points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(" ")} Z`;
}

function distanceToAssembly(point, assembly) {
  return Math.min(...assembly.curves.flatMap(curve => curve.points.map(sample => vectorError(point, sample))));
}

function syllableSupportColumns(value) {
  const supports = [[0, 0, 0]];
  let slots = 0;
  for (const character of String(value || "").normalize("NFC")) {
    const { layout } = makeSyllableLayout(character);
    slots += layout.reduce((sum, item) => sum + item.advance, 0);
    supports.push([slots * fontData.cellStep, 0, 0]);
  }
  return supports.filter((point, index, list) => index === 0 || point[0] > list[index - 1][0] + 0.01);
}

function rotateName(value, shift) {
  const syllables = Array.from(String(value || "").normalize("NFC")).filter(character => !/\s/.test(character));
  if (!syllables.length) return "";
  const offset = ((shift % syllables.length) + syllables.length) % syllables.length;
  return [...syllables.slice(offset), ...syllables.slice(0, offset)].join("");
}

function createLayerAssemblies(name) {
  return [
    { key: "bottom", label: "하", name: rotateName(name, 2), z: 30 },
    { key: "middle", label: "중", name: rotateName(name, 1), z: 82 },
    { key: "top", label: "상", name: rotateName(name, 0), z: 134 }
  ].map(layer => ({ ...layer, assembly: composeName(layer.name) }));
}

function sampledGlyphPoints(assembly, stride = 4) {
  const samples = [];
  assembly.curves.filter(curve => curve.kind === "glyph").forEach(curve => {
    curve.points.forEach((point, index) => {
      if (index % stride === 0 || index === curve.points.length - 1) {
        samples.push({ point, token: curve.token, slot: curve.slot });
      }
    });
  });
  return samples;
}

function collectOverlapCandidates(layerDefinitions, threshold = 18) {
  const pairs = [[0, 1], [1, 2], [0, 2]];
  const candidates = [];
  const cellSize = threshold;

  pairs.forEach(([firstIndex, secondIndex]) => {
    const first = sampledGlyphPoints(layerDefinitions[firstIndex].assembly);
    const second = sampledGlyphPoints(layerDefinitions[secondIndex].assembly);
    const buckets = new Map();

    first.forEach(sample => {
      const key = `${Math.floor(sample.point[0] / cellSize)},${Math.floor(sample.point[1] / cellSize)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(sample);
    });

    second.forEach(sample => {
      const gridX = Math.floor(sample.point[0] / cellSize);
      const gridY = Math.floor(sample.point[1] / cellSize);
      let nearest = null;

      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
          const nearby = buckets.get(`${gridX + xOffset},${gridY + yOffset}`) || [];
          nearby.forEach(candidate => {
            const distance = vectorError(sample.point, candidate.point);
            if (distance <= threshold && (!nearest || distance < nearest.distance)) {
              nearest = { sample: candidate, distance };
            }
          });
        }
      }

      if (nearest) {
        candidates.push({
          point: [
            (sample.point[0] + nearest.sample.point[0]) / 2,
            (sample.point[1] + nearest.sample.point[1]) / 2,
            0
          ],
          score: threshold - nearest.distance + (sample.token === nearest.sample.token ? 0 : 4)
        });
      }
    });
  });

  const clustered = [];
  candidates.sort((a, b) => b.score - a.score).forEach(candidate => {
    if (clustered.every(existing => vectorError(existing.point, candidate.point) >= 34)) {
      clustered.push(candidate);
    }
  });
  return clustered;
}

function selectOverlapAnchors(candidates, bounds, count = 3) {
  if (!candidates.length) return [];
  const selected = [];
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const targets = count === 1 ? [0.5] : Array.from({ length: count }, (_, index) => 0.16 + index * (0.68 / (count - 1)));

  targets.forEach(ratio => {
    const targetX = bounds.minX + width * ratio;
    const available = candidates.filter(candidate => selected.every(point => vectorError(point, candidate.point) >= 54));
    const pool = available.length ? available : candidates.filter(candidate => !selected.includes(candidate.point));
    const best = pool.reduce((winner, candidate) => {
      const value = Math.abs(candidate.point[0] - targetX) / width - candidate.score * 0.002;
      return !winner || value < winner.value ? { point: candidate.point, value } : winner;
    }, null);
    if (best && !selected.includes(best.point)) selected.push(best.point);
  });
  return selected;
}

function createBaseGeometry(cellCount) {
  const jointDelta = fontData.joints?.J0?.delta || [15, 25.9808];
  const step = Math.round(Math.hypot(jointDelta[0], jointDelta[1]) * 1000) / 1000;
  const halfStep = step / 2;
  const gridRise = Math.abs(jointDelta[1]);
  const rowCount = 5;
  const left = -step;
  const nameEnd = cellCount * fontData.cellStep;
  const right = nameEnd + halfStep;
  const back = -2 * gridRise;
  const front = back + rowCount * gridRise;
  const rowBounds = Array.from({ length: rowCount + 1 }, (_, row) => {
    const offset = row % 2 ? halfStep : 0;
    return {
      y: back + row * gridRise,
      start: left + offset,
      end: right - halfStep + offset
    };
  });
  const outline = [
    [rowBounds[0].start, rowBounds[0].y],
    [rowBounds[0].end, rowBounds[0].y],
    ...rowBounds.slice(1).map(row => [row.end, row.y]),
    [rowBounds.at(-1).start, rowBounds.at(-1).y],
    ...rowBounds.slice(1, -1).reverse().map(row => [row.start, row.y])
  ];
  const segments = [];
  const holes = [];

  for (let row = 0; row <= rowCount; row += 1) {
    const { y, start: rowStart, end: rowEnd } = rowBounds[row];
    segments.push([[rowStart, y], [rowEnd, y]]);
    for (let x = rowStart; x <= rowEnd + 0.01; x += step) {
      const isInsideEdge = x > rowStart + 0.01 && x < rowEnd - 0.01;
      if (row > 0 && row < rowCount && isInsideEdge) holes.push([x, y, 0]);
      if (row < rowCount) {
        const nextY = y + gridRise;
        const nextStart = rowBounds[row + 1].start;
        const nextEnd = rowBounds[row + 1].end;
        [[x - halfStep, nextY], [x + halfStep, nextY]].forEach(endpoint => {
          if (endpoint[0] >= nextStart - 0.01 && endpoint[0] <= nextEnd + 0.01) {
            segments.push([[x, y], endpoint]);
          }
        });
      }
    }
  }
  return { outline, segments, holes };
}

function commonCurveSupportHoles(layerDefinitions, holes, tolerance = 0.25) {
  return holes
    .filter(hole => layerDefinitions.every(layer => distanceToAssembly(hole, layer.assembly) <= tolerance))
    .sort((first, second) => first[0] - second[0] || first[1] - second[1]);
}

function selectDistributedSupports(candidates, count) {
  if (candidates.length <= count) return candidates;
  const minX = candidates[0][0];
  const maxX = candidates.at(-1)[0];
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    const targetX = minX + (maxX - minX) * ratio;
    const available = candidates.filter(candidate => !selected.includes(candidate));
    const nearest = available.reduce((best, candidate) => {
      const distance = Math.abs(candidate[0] - targetX);
      return !best || distance < best.distance ? { candidate, distance } : best;
    }, null);
    if (nearest) selected.push(nearest.candidate);
  }
  return selected.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
}

function selectSixCellSupports(candidates, count, triangleSide) {
  if (!count || !candidates.length) return [];
  const pitch = triangleSide * 6;
  const centerCandidates = candidates.filter(point => Math.abs(point[1]) <= 0.25);
  const sequences = centerCandidates.map(start => {
    const points = [start];
    for (let index = 1; index < count; index += 1) {
      const targetX = start[0] + pitch * index;
      const match = centerCandidates.find(point => Math.abs(point[0] - targetX) <= 0.25);
      if (!match) return null;
      points.push(match);
    }
    return points;
  }).filter(Boolean);
  if (sequences.length) {
    return sequences.sort((first, second) => Math.abs(first[0][0]) - Math.abs(second[0][0]))[0];
  }
  return selectDistributedSupports(candidates, count);
}

function makeFlowerCluster(anchor, index) {
  const [baseX, baseY] = iso(anchor, 3);
  const variants = [
    { file: "flower-gerbera.webp", height: 238, anchorX: .56, angle: -4 },
    { file: "flower-spike.webp", height: 274, anchorX: .16, angle: 5 },
    { file: "flower-carnation.webp", height: 208, anchorX: .51, angle: -2 },
    { file: "flower-spike.webp", height: 224, anchorX: .16, angle: -7 },
    { file: "flower-carnation.webp", height: 184, anchorX: .51, angle: 3 },
    { file: "flower-gerbera.webp", height: 214, anchorX: .56, angle: 6 },
    { file: "flower-spike.webp", height: 248, anchorX: .16, angle: -3 }
  ];
  const variant = variants[index % variants.length];
  const width = variant.height * 2 / 3;
  const xShift = [-6, 4, -2, 7, -5, 3, 0][index % 7];
  return {
    file: variant.file,
    x: baseX - width * variant.anchorX + xShift,
    y: baseY - variant.height + 3,
    width,
    height: variant.height,
    baseX: baseX + xShift,
    baseY,
    angle: variant.angle
  };
}

function addFlowerCluster(svg, flower) {
  const group = svgEl("g", {
    transform: `rotate(${flower.angle} ${flower.baseX} ${flower.baseY})`,
    class: "photo-flower-wrap"
  });
  const image = svgEl("image", {
    href: `./${flower.file}`,
    x: flower.x,
    y: flower.y,
    width: flower.width,
    height: flower.height,
    preserveAspectRatio: "xMidYMax meet",
    class: "photo-flower",
    filter: "url(#mint-photo-filter)"
  });
  if (flower.mirror) {
    image.setAttribute("transform", `translate(${2 * flower.baseX} 0) scale(-1 1)`);
  }
  group.append(image);
  svg.append(group);
}

function renderObject(layerDefinitions, name) {
  vaseSvg.replaceChildren();
  const objectLayers = layerDefinitions;
  const topLayer = objectLayers.find(layer => layer.key === "top");
  if (!topLayer?.assembly.curves.length) {
    emptyObject.hidden = false;
    vaseSvg.removeAttribute("viewBox");
    return;
  }
  emptyObject.hidden = true;

  const worldPoints = objectLayers.flatMap(layer => layer.assembly.curves.flatMap(curve => curve.points));
  const bounds = pointsBounds(worldPoints);
  const baseGeometry = createBaseGeometry(topLayer.assembly.cellCount);
  const base = baseGeometry.outline;
  const topZ = topLayer.z;
  const syllableCount = Array.from(String(name || "").normalize("NFC")).filter(character => !/\s/.test(character)).length;
  const commonSupports = commonCurveSupportHoles(objectLayers, baseGeometry.holes);
  const triangleSide = Math.round(Math.hypot(...fontData.joints.J0.delta) * 1000) / 1000;
  const supports = selectSixCellSupports(commonSupports, syllableCount, triangleSide);
  const overlapCandidates = collectOverlapCandidates(objectLayers);
  const openOverlapCandidates = overlapCandidates.filter(candidate => supports.every(point => vectorError(point, candidate.point) >= 24));
  const flowerCount = Math.max(6, syllableCount * 3 + Math.floor(topLayer.assembly.cellCount / 4));
  const flowerTargets = selectOverlapAnchors(openOverlapCandidates, bounds, flowerCount);
  const flowerTypeCounts = new Map();
  const flowers = flowerTargets.map((point, index) => {
    const flower = makeFlowerCluster(point, index);
    const occurrence = flowerTypeCounts.get(flower.file) || 0;
    flower.mirror = occurrence % 2 === 1;
    flowerTypeCounts.set(flower.file, occurrence + 1);
    return flower;
  });

  const projected = [
    ...base.flatMap(point => [iso(point, -10), iso(point, 0)]),
    ...objectLayers.flatMap(layer => layer.assembly.curves.flatMap(curve => curve.points.map(point => iso(point, layer.z)))),
    ...supports.map(point => iso(point, topZ + 36)),
    ...flowers.flatMap(flower => [[flower.x, flower.y], [flower.x + flower.width, flower.y + flower.height]])
  ];
  const screenBounds = pointsBounds(projected);
  const viewPad = 52;
  vaseSvg.setAttribute("viewBox", `${screenBounds.minX - viewPad} ${screenBounds.minY - viewPad} ${screenBounds.maxX - screenBounds.minX + viewPad * 2} ${screenBounds.maxY - screenBounds.minY + viewPad * 2}`);
  vaseSvg.setAttribute("aria-label", `${name}의 자모 구조로 생성된 3층 아이소메트릭 꽃병`);

  const defs = svgEl("defs");
  const clipPath = svgEl("clipPath", { id: "base-grid-clip" });
  clipPath.append(svgEl("path", { d: polygonPath(base, 1) }));
  defs.append(clipPath);
  const photoFilter = svgEl("filter", { id: "mint-photo-filter", x: "-12%", y: "-12%", width: "124%", height: "124%" });
  photoFilter.append(svgEl("feColorMatrix", { type: "saturate", values: "0", result: "gray" }));
  const transfer = svgEl("feComponentTransfer", { in: "gray" });
  transfer.append(svgEl("feFuncR", { type: "table", tableValues: ".12 .38 .68 .92" }));
  transfer.append(svgEl("feFuncG", { type: "table", tableValues: ".15 .80 .90 .98" }));
  transfer.append(svgEl("feFuncB", { type: "table", tableValues: ".14 .69 .80 .96" }));
  transfer.append(svgEl("feFuncA", { type: "identity" }));
  photoFilter.append(transfer);
  defs.append(photoFilter);
  vaseSvg.append(defs);

  vaseSvg.append(svgEl("path", { d: polygonPath(base, -18, 14), class: "base-shadow" }));
  base.map((point, index) => {
    const next = base[(index + 1) % base.length];
    const firstScreen = iso(point, 0);
    const secondScreen = iso(next, 0);
    return {
      d: baseSidePath(point, next),
      depth: (firstScreen[1] + secondScreen[1]) / 2
    };
  }).sort((first, second) => first.depth - second.depth).forEach(side => {
    vaseSvg.append(svgEl("path", { d: side.d, class: "base-side-face" }));
  });
  vaseSvg.append(svgEl("path", { d: polygonPath(base, 0), class: "base-top" }));

  const gridGroup = svgEl("g", { "clip-path": "url(#base-grid-clip)" });
  baseGeometry.segments.forEach(segment => {
    gridGroup.append(svgEl("path", { d: linePath(segment, point => iso(point, 1)), class: "base-grid" }));
  });
  baseGeometry.holes.forEach(point => {
    const [x, y] = iso(point, 2);
    gridGroup.append(svgEl("ellipse", { cx: x, cy: y, rx: 4.3, ry: 2.5, class: "base-hole" }));
    gridGroup.append(svgEl("ellipse", { cx: x, cy: y, rx: 1.4, ry: .9, class: "base-hole-core" }));
  });
  vaseSvg.append(gridGroup);

  supports.forEach(point => {
    const start = iso(point, 5);
    const end = iso(point, topZ + 32);
    vaseSvg.append(svgEl("line", { x1: start[0], y1: start[1], x2: end[0], y2: end[1], class: "post-back" }));
    vaseSvg.append(svgEl("line", { x1: start[0] - 1, y1: start[1], x2: end[0] - 1, y2: end[1], class: "post-light" }));
  });

  objectLayers.forEach(layer => {
    layer.assembly.curves.forEach(curve => {
      const group = svgEl("g", { class: curve.kind === "joint" ? "plate-joint" : "plate-glyph" });
      group.append(svgEl("path", { d: linePath(curve.points, point => iso(point, layer.z - 4)), class: "plate-side" }));
      group.append(svgEl("path", { d: linePath(curve.points, point => iso(point, layer.z)), class: "plate-edge" }));
      group.append(svgEl("path", { d: linePath(curve.points, point => iso(point, layer.z)), class: "plate-top" }));
      vaseSvg.append(group);
    });

    supports.forEach(point => {
      const [x, y] = iso(point, layer.z + 1);
      vaseSvg.append(svgEl("ellipse", { cx: x, cy: y, rx: 4.2, ry: 2.2, class: "washer" }));
      vaseSvg.append(svgEl("ellipse", { cx: x, cy: y - .6, rx: 1.8, ry: 1.1, class: "bolt-cap" }));
    });
  });

  supports.forEach(point => {
    const [x, y] = iso(point, topZ + 32);
    vaseSvg.append(svgEl("ellipse", { cx: x, cy: y, rx: 3.6, ry: 2.1, class: "post-cap" }));
  });

  // Flowers stay anchored to the layer-overlap insertion points, but render in
  // front so the full stem remains legible. Transparency keeps the assembly visible.
  flowers.forEach(flower => addFlowerCluster(vaseSvg, flower));
}

function update() {
  if (!fontData) return null;
  const name = input.value.trim();
  const assembly = composeName(name);
  const layerDefinitions = createLayerAssemblies(name);
  renderFont(assembly, name);
  renderObject(layerDefinitions, name);

  if (assembly.unsupported.length) {
    unsupportedLine.hidden = false;
    unsupportedLine.textContent = `지원하지 않는 문자: ${assembly.unsupported.join(" ")}`;
  } else if (assembly.unmatched.length) {
    unsupportedLine.hidden = false;
    unsupportedLine.textContent = `연결되지 않은 구간 ${assembly.unmatched.length}개`;
  } else {
    unsupportedLine.hidden = true;
    unsupportedLine.textContent = "";
  }
  return assembly;
}

function registerNameTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  try {
    void Promise.resolve(context.registerTool({
      name: "set_hangul_name",
      title: "이름으로 꽃병 만들기",
      description: "한글 이름을 입력하고 흘림 폰트와 아이소메트릭 꽃병을 화면에 생성합니다.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", minLength: 1, maxLength: 8 } },
        required: ["name"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(args) {
        if (!args || typeof args.name !== "string" || !args.name.trim() || args.name.length > 8) {
          throw new Error("1자 이상 8자 이하의 한글 이름을 입력해 주세요.");
        }
        input.value = args.name.trim();
        const assembly = update();
        return {
          name: input.value,
          cells: assembly.cellCount,
          tokens: assembly.layout.filter(item => item.token).map(item => item.token),
          unsupported: assembly.unsupported
        };
      }
    })).catch(() => {});
  } catch (_) {
    // The visible interface remains fully functional when WebMCP is unavailable.
  }
}

input.addEventListener("input", update);

fetch("./font-data.json")
  .then(response => {
    if (!response.ok) throw new Error("font-data.json을 불러오지 못했습니다.");
    return response.json();
  })
  .then(data => {
    fontData = data;
    update();
    registerNameTool();
  })
  .catch(error => {
    unsupportedLine.hidden = false;
    unsupportedLine.textContent = error.message || "폰트 데이터를 확인해 주세요.";
  });
