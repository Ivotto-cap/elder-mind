
const SAVE_KEY = "elder-mind-save-v2";
const DISTANT_NETWORK_SEED = 29;

const upgrades = [
  {
    id: "synapse",
    name: "Sinapsi Amplificate",
    description: "Aumenta la potenza del click di +1.",
    unlockAt: 50,
    baseCost: 20,
    costScale: 1.18,
    type: "click",
    value: 1,
    position: { left: "11%", top: "24%" }
  },
  {
    id: "cortex",
    name: "Riflesso Rapido",
    description: "Aumenta la risposta ai click rapidi di +1.",
    unlockAt: 100,
    baseCost: 40,
    costScale: 1.2,
    type: "click",
    value: 1,
    position: { right: "10%", top: "18%" }
  },
  {
    id: "drone",
    name: "Droni Neuromorfici",
    description: "Genera +1 impulso al secondo automaticamente.",
    unlockAt: 200,
    baseCost: 110,
    costScale: 1.28,
    type: "auto",
    value: 1,
    position: { left: "8%", top: "63%" }
  },
  {
    id: "cluster",
    name: "Flusso Basale",
    description: "Stabilizza la rete e genera +1 impulso al secondo.",
    unlockAt: 300,
    baseCost: 180,
    costScale: 1.32,
    type: "auto",
    value: 1,
    position: { right: "8%", top: "60%" }
  }
];

const upgradeIcons = {
  synapse: "+1",
  cortex: "R+",
  drone: "A1",
  cluster: "B1"
};

const defaultState = {
  impulses: 0,
  maxImpulses: 0,
  totalClicks: 0,
  clickPower: 1,
  autoPower: 0,
  upgrades: upgrades.map((upgrade) => ({ id: upgrade.id, owned: 0 })),
  revealed: []
};

const arena = document.getElementById("arena");
const linkLayer = document.getElementById("linkLayer");
const environmentCanvas = document.getElementById("environmentCanvas");
const environmentPulses = document.getElementById("environmentPulses");
const introOverlay = document.getElementById("introOverlay");
const introStep = document.getElementById("introStep");
const introButton = document.getElementById("introButton");
const appShell = document.querySelector(".app");
const brain = document.getElementById("brain");
const brainCurrent = document.getElementById("brainCurrent");
const brainNext = document.getElementById("brainNext");
const brainZone = document.getElementById("brainZone");
const upgradeField = document.getElementById("upgradeField");
const synapseTooltip = document.getElementById("synapseTooltip");
const hint = document.getElementById("hint");
const impulsesEl = document.getElementById("impulses");
const clickPowerEl = document.getElementById("clickPower");
const autoPowerEl = document.getElementById("autoPower");
const statusText = document.getElementById("statusText");
const resetBtn = document.getElementById("resetBtn");

let lastAutoTick = performance.now();
let saveTimer = null;
let linkCleanupTimers = [];
let activatedRoots = new Set();
let rootCanvas = null;
let rootCtx = null;
let currentBrainStage = -1;
let brainFadeTimer = null;
let introIndex = 0;
let introCompleted = false;
let branchVisualTime = 0;
let branchAnimationFrame = 0;
let environmentCtx = null;
let environmentNodes = [];
let brainReleaseTimer = null;
let brainHoldTimer = null;
let lastBrainClickAt = 0;
let brainIsPressed = false;
let brainCurrentCompression = 1;
let activeBrainPointerId = null;
let brainHoldStartAt = 0;
let brainHoldProgress = 0;
let brainPressAnimationFrame = 0;
let brainMinCompression = 0.99;
let brainMaxCompression = 0.96;
let lastSavedAt = 0;
let activeTooltipNodeId = null;

const introSteps = [
  {
    title: "ELDER MIND // PROTOCOLLO DI RECUPERO NEURALE",
    body: [
      "Supporto biologico recuperato.",
      "Stato cerebrale: gravemente atrofizzato.",
      "Attività neurale residua: minima."
    ],
    button: "Continua"
  },
  {
    title: "",
    body: [
      "Alcune sinapsi rispondono ancora agli stimoli esterni.",
      "La rete non è del tutto collassata.",
      "È possibile tentare una riattivazione graduale."
    ],
    button: "Continua"
  },
  {
    title: "",
    body: [
      "Ogni impulso contribuirà al ripristino delle connessioni.",
      "Ogni connessione accelererà il risveglio.",
      "La procedura può iniziare."
    ],
    button: "Avvia procedura"
  }
];

const brainStages = [
  { threshold: 0, src: "brain0.png" },
  { threshold: 1000, src: "brain1.png" },
  { threshold: 2000, src: "brain2.png" },
  { threshold: 3000, src: "brain3.png" },
  { threshold: 4000, src: "brain4.png" },
  { threshold: 5000, src: "brain5.png" }
];

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return cloneState(defaultState);
    }

    const parsed = JSON.parse(raw);
    const merged = cloneState(defaultState);

    merged.impulses = Number(parsed.impulses) || 0;
    merged.maxImpulses = Math.max(merged.impulses, Number(parsed.maxImpulses) || 0);
    merged.totalClicks = Number(parsed.totalClicks) || 0;

    if (Array.isArray(parsed.upgrades)) {
      for (const saved of parsed.upgrades) {
        const match = merged.upgrades.find((item) => item.id === saved.id);
        if (match) {
          match.owned = Math.max(0, Number(saved.owned) || 0);
        }
      }
    }

    if (Array.isArray(parsed.revealed)) {
      merged.revealed = parsed.revealed.filter((id) => upgrades.some((upgrade) => upgrade.id === id));
    }

    return merged;
  } catch (error) {
    return cloneState(defaultState);
  }
}

const game = loadState();
activatedRoots = new Set(game.revealed || []);

function ensureRootCanvas() {
  if (!rootCanvas) {
    rootCanvas = document.createElement("canvas");
    rootCanvas.className = "root-canvas";
    linkLayer.prepend(rootCanvas);
    rootCtx = rootCanvas.getContext("2d");
  }
}

function seededNoise(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function ensureEnvironmentCanvas() {
  if (!environmentCtx) {
    environmentCtx = environmentCanvas.getContext("2d");
  }
}

function buildEnvironmentNodes(width, height) {
  const nodes = [];
  const cols = 6;
  const rows = 4;
  const marginX = width * 0.1;
  const marginY = height * 0.14;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col + 1;
      const baseX = marginX + (col / (cols - 1)) * (width - marginX * 2);
      const baseY = marginY + (row / (rows - 1)) * (height - marginY * 2);
      const jitterX = (seededNoise(index * DISTANT_NETWORK_SEED) - 0.5) * 90;
      const jitterY = (seededNoise(index * (DISTANT_NETWORK_SEED + 7)) - 0.5) * 70;
      nodes.push({
        x: baseX + jitterX,
        y: baseY + jitterY,
        seed: seededNoise(index * 3.7)
      });
    }
  }

  return nodes;
}

function resizeEnvironmentCanvas() {
  ensureEnvironmentCanvas();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(window.innerWidth));
  const height = Math.max(1, Math.round(window.innerHeight));

  if (environmentCanvas.width !== Math.round(width * dpr) || environmentCanvas.height !== Math.round(height * dpr)) {
    environmentCanvas.width = Math.round(width * dpr);
    environmentCanvas.height = Math.round(height * dpr);
    environmentCanvas.style.width = width + "px";
    environmentCanvas.style.height = height + "px";
    environmentCtx.setTransform(1, 0, 0, 1, 0, 0);
    environmentCtx.scale(dpr, dpr);
    environmentNodes = buildEnvironmentNodes(width, height);
  }
}

function drawDistantNetwork(progress) {
  if (!environmentCtx || !environmentNodes.length) {
    return;
  }

  const globalPulse = 0.92 + Math.sin(branchVisualTime * 0.00035) * 0.08;
  const nodeAlpha = 0.015 + progress * 0.07;
  const lineAlpha = 0.01 + progress * 0.045;

  for (let index = 0; index < environmentNodes.length; index++) {
    const node = environmentNodes[index];
    for (let nextIndex = index + 1; nextIndex < environmentNodes.length; nextIndex++) {
      const next = environmentNodes[nextIndex];
      const dx = next.x - node.x;
      const dy = next.y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 280) {
        continue;
      }

      environmentCtx.save();
      environmentCtx.strokeStyle = `rgba(114, 240, 255, ${(1 - distance / 280) * lineAlpha * globalPulse})`;
      environmentCtx.lineWidth = 0.8;
      environmentCtx.beginPath();
      environmentCtx.moveTo(node.x, node.y);
      environmentCtx.lineTo(next.x, next.y);
      environmentCtx.stroke();
      environmentCtx.restore();
    }
  }

  for (const node of environmentNodes) {
    const pulse = 0.85 + Math.sin(branchVisualTime * 0.001 + node.seed * 8) * 0.12;
    environmentCtx.save();
    environmentCtx.fillStyle = `rgba(180, 248, 255, ${nodeAlpha * pulse})`;
    environmentCtx.shadowColor = `rgba(114, 240, 255, ${nodeAlpha * 2.4})`;
    environmentCtx.shadowBlur = 10;
    environmentCtx.beginPath();
    environmentCtx.arc(node.x, node.y, 1.3 + progress * 0.8, 0, Math.PI * 2);
    environmentCtx.fill();
    environmentCtx.restore();
  }
}

function drawBranchAmbient(progress) {
  return;
}

function renderEnvironment() {
  resizeEnvironmentCanvas();
  if (!environmentCtx) {
    return;
  }
  environmentCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const progress = Math.max(
    Math.min((game.maxImpulses || 0) / 5000, 1),
    Math.min(game.totalClicks / 240, 1),
    Math.min(game.revealed.length / upgrades.length, 1)
  );

  drawDistantNetwork(progress);
  drawBranchAmbient(progress);
}

function spawnBackgroundPulse(event) {
  const pulse = document.createElement("div");
  pulse.className = "bg-pulse";
  pulse.style.left = event.clientX + "px";
  pulse.style.top = event.clientY + "px";
  environmentPulses.appendChild(pulse);
  setTimeout(() => pulse.remove(), 1700);
}

function formatNumber(value) {
  const units = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const absValue = Math.floor(Math.abs(value));

  if (absValue < 1000) {
    return Math.floor(value).toLocaleString("it-IT");
  }

  let unitIndex = 0;
  let scaled = absValue;

  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex++;
  }

  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const formatted = scaled.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });

  return (value < 0 ? "-" : "") + formatted + " " + units[unitIndex];
}

function getUpgradeState(id) {
  return game.upgrades.find((upgrade) => upgrade.id === id);
}

function getCost(upgrade) {
  const owned = getUpgradeState(upgrade.id).owned;
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costScale, owned));
}

function recalculateStats() {
  let clickPower = 1;
  let autoPower = 0;

  for (const upgrade of upgrades) {
    const owned = getUpgradeState(upgrade.id).owned;
    if (upgrade.type === "click") {
      clickPower += owned * upgrade.value;
    } else {
      autoPower += owned * upgrade.value;
    }
  }

  game.clickPower = clickPower;
  game.autoPower = autoPower;
}

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  lastSavedAt = Date.now();
  statusText.textContent = "Progressi salvati automaticamente su questo browser.";
}

function queueSave() {
  const now = Date.now();
  const elapsed = now - lastSavedAt;
  const delay = Math.max(0, 10000 - elapsed);

  if (saveTimer) {
    return;
  }

  statusText.textContent = "Salvataggio pianificato...";
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveGame();
  }, delay);
}

function clearLinkLayer() {
  for (const timer of linkCleanupTimers) {
    clearTimeout(timer);
  }
  linkCleanupTimers = [];
  linkLayer.querySelectorAll(".root-spark").forEach((node) => node.remove());

  if (rootCtx && rootCanvas) {
    rootCtx.clearRect(0, 0, rootCanvas.width, rootCanvas.height);
  }
}

function resizeRootCanvas() {
  if (window.innerWidth <= 980) {
    if (rootCtx && rootCanvas) {
      rootCtx.clearRect(0, 0, rootCanvas.width, rootCanvas.height);
    }
    return;
  }

  ensureRootCanvas();
  const rect = linkLayer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  if (rootCanvas.width !== Math.round(width * dpr) || rootCanvas.height !== Math.round(height * dpr)) {
    rootCanvas.width = Math.round(width * dpr);
    rootCanvas.height = Math.round(height * dpr);
    rootCanvas.style.width = width + "px";
    rootCanvas.style.height = height + "px";
    rootCtx.setTransform(1, 0, 0, 1, 0, 0);
    rootCtx.scale(dpr, dpr);
  } else {
    rootCtx.clearRect(0, 0, width, height);
  }
}

function renderStats() {
  impulsesEl.textContent = formatNumber(game.impulses);
  clickPowerEl.textContent = formatNumber(game.clickPower);
  autoPowerEl.textContent = formatNumber(game.autoPower);
}

function getBrainStageIndex() {
  let stageIndex = 0;
  const progressValue = Math.max(game.impulses, game.maxImpulses || 0);

  for (let index = 0; index < brainStages.length; index++) {
    if (progressValue >= brainStages[index].threshold) {
      stageIndex = index;
    }
  }

  return stageIndex;
}

function updateBrainVisual() {
  const nextStageIndex = getBrainStageIndex();
  if (nextStageIndex === currentBrainStage) {
    return;
  }

  const nextSrc = brainStages[nextStageIndex].src;

  if (currentBrainStage === -1) {
    brainCurrent.src = nextSrc;
    brainNext.src = nextSrc;
    brainCurrent.classList.add("active");
    brainNext.classList.remove("active");
    currentBrainStage = nextStageIndex;
    return;
  }

  clearTimeout(brainFadeTimer);
  brainNext.src = nextSrc;
  brainNext.classList.add("active");

  brainFadeTimer = setTimeout(() => {
    brainCurrent.src = nextSrc;
    brainCurrent.classList.add("active");
    brainNext.classList.remove("active");
    currentBrainStage = nextStageIndex;
  }, 700);
}

function updateDormancyVisual() {
  brainZone.classList.toggle("is-awake", game.totalClicks > 0);
}

function updateAtmosphere() {
  const progress = Math.max(0, Math.min((game.maxImpulses || 0) / 5000, 1));
  const eased = 1 - Math.pow(1 - progress, 2);
  const introFactor = introCompleted ? 1 : 0;
  const root = document.documentElement;

  const chamberGlow = 0.05 + eased * 0.13;
  const chamberLeft = 0.018 + eased * 0.06;
  const chamberRight = 0.014 + eased * 0.05;
  const gridOpacity = (0.12 + eased * 0.18) * (introFactor || 0.75);
  const ambientBrightness = introFactor ? 0.58 + eased * 0.3 : 0.52;
  const ambientSaturate = introFactor ? 0.68 + eased * 0.32 : 0.62;
  const veilOpacity = introFactor ? 0.42 - eased * 0.18 : 0.58;

  root.style.setProperty("--chamber-glow", chamberGlow.toFixed(3));
  root.style.setProperty("--chamber-left", chamberLeft.toFixed(3));
  root.style.setProperty("--chamber-right", chamberRight.toFixed(3));
  root.style.setProperty("--grid-opacity", gridOpacity.toFixed(3));
  root.style.setProperty("--ambient-brightness", ambientBrightness.toFixed(3));
  root.style.setProperty("--ambient-saturate", ambientSaturate.toFixed(3));
  root.style.setProperty("--veil-opacity", veilOpacity.toFixed(3));
}

function renderIntroStep() {
  const step = introSteps[introIndex];
  const titleMarkup = step.title ? `<h2>${step.title}</h2>` : "";
  introStep.innerHTML = `
    ${titleMarkup}
    <p>${step.body.join("<br>")}</p>
  `;
  introButton.textContent = step.button;
}

function advanceIntro() {
  if (introIndex >= introSteps.length - 1) {
    introCompleted = true;
    introOverlay.classList.add("hidden");
    appShell.classList.add("revealed");
    updateAtmosphere();
    hideHintIfNeeded();
    return;
  }

  introStep.classList.add("fading");
  setTimeout(() => {
    introIndex += 1;
    renderIntroStep();
    introStep.classList.remove("fading");
  }, 360);
}

function getBrainCenter() {
  const arenaRect = arena.getBoundingClientRect();
  const sourceRect = brain.getBoundingClientRect();
  return {
    x: sourceRect.left + sourceRect.width / 2 - arenaRect.left,
    y: sourceRect.top + sourceRect.height / 2 - arenaRect.top
  };
}

function getFixedUpgradeSpheres() {
  const arenaRect = arena.getBoundingClientRect();
  const center = getBrainCenter();
  const offsetX = Math.min(250, Math.max(130, arenaRect.width * 0.2));
  const offsetY = Math.min(210, Math.max(120, arenaRect.height * 0.18));

  return [
    { id: "s1", upgradeId: "synapse", x: center.x - offsetX, y: center.y - offsetY },
    { id: "s2", upgradeId: "cortex", x: center.x + offsetX, y: center.y - offsetY },
    { id: "s3", upgradeId: "drone", x: center.x - offsetX, y: center.y + offsetY },
    { id: "s4", upgradeId: "cluster", x: center.x + offsetX, y: center.y + offsetY }
  ];
}

function showSynapseTooltip(nodeData) {
  if (!nodeData) {
    synapseTooltip.classList.remove("visible");
    activeTooltipNodeId = null;
    return;
  }

  const upgrade = upgrades.find((item) => item.id === nodeData.upgradeId);
  const cost = getCost(upgrade);
  synapseTooltip.innerHTML = `
    <div class="tooltip-name">${upgrade.name}</div>
    <div class="tooltip-desc">${upgrade.description}</div>
    <div class="tooltip-cost">Costo ${formatNumber(cost)}</div>
  `;
  synapseTooltip.style.left = nodeData.x + "px";
  synapseTooltip.style.top = nodeData.y + "px";
  synapseTooltip.classList.add("visible");
  activeTooltipNodeId = nodeData.id;
}

function createSynapseNode(nodeData) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "synapse-node primary-upgrade visible";
  element.dataset.nodeId = nodeData.id;
  element.dataset.upgradeId = nodeData.upgradeId;
  element.style.left = nodeData.x + "px";
  element.style.top = nodeData.y + "px";

  const upgrade = upgrades.find((item) => item.id === nodeData.upgradeId);
  const unlocked = game.maxImpulses >= upgrade.unlockAt;
  const affordable = unlocked && game.impulses >= getCost(upgrade);
  const owned = getUpgradeState(upgrade.id).owned;

  element.classList.add(unlocked ? "unlocked" : "locked");
  element.setAttribute("aria-label", `${upgrade.name}, costo ${formatNumber(getCost(upgrade))}`);
  if (affordable) {
    element.classList.add("affordable");
  }
  if (owned > 0) {
    element.classList.add("owned");
  }

  element.innerHTML = `
    <span class="synapse-icon">${upgradeIcons[upgrade.id] || "+"}</span>
    <span class="synapse-owned">x${owned}</span>
  `;

  return element;
}

function renderUpgrades() {
  upgradeField.innerHTML = "";
  synapseTooltip.classList.remove("visible");
  activeTooltipNodeId = null;

  for (const nodeData of getFixedUpgradeSpheres()) {
    upgradeField.appendChild(createSynapseNode(nodeData));
  }
}

function getPartialBranchPoints(path, progress) {
  if (!path || path.length < 2 || progress <= 0) {
    return [];
  }

  const clamped = Math.max(0, Math.min(progress, 1));
  const segments = [];
  let totalLength = 0;

  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1];
    const end = path[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    segments.push({ start, end, length });
    totalLength += length;
  }

  const targetLength = totalLength * clamped;
  let consumed = 0;
  const partial = [{ x: path[0].x, y: path[0].y }];

  for (const segment of segments) {
    if (consumed + segment.length <= targetLength) {
      partial.push({ x: segment.end.x, y: segment.end.y });
      consumed += segment.length;
      continue;
    }

    const remaining = Math.max(0, targetLength - consumed);
    const ratio = segment.length > 0 ? remaining / segment.length : 0;
    partial.push({
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio
    });
    break;
  }

  return partial;
}

function drawTaperedStroke(ctx, points, widthStart, widthEnd, color, blur) {
  if (!ctx || !points || points.length < 2) {
    return;
  }

  const lastSegment = Math.max(1, points.length - 1);
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;

  for (let index = 1; index < points.length; index++) {
    const t = (index - 1) / lastSegment;
    const eased = 1 - Math.pow(t, 0.9);
    ctx.lineWidth = widthEnd + (widthStart - widthEnd) * eased;
    ctx.beginPath();
    ctx.moveTo(points[index - 1].x, points[index - 1].y);
    ctx.lineTo(points[index].x, points[index].y);
    ctx.stroke();
  }
}

function drawTwig(ctx, twig, color, blur) {
  if (!twig || !twig.points || twig.points.length < 3) {
    return;
  }

  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(twig.points[0].x, twig.points[0].y);
  ctx.quadraticCurveTo(
    twig.points[1].x,
    twig.points[1].y,
    twig.points[2].x,
    twig.points[2].y
  );
  ctx.stroke();
}

function getPointAtProgress(path, progress) {
  const partial = getPartialBranchPoints(path, progress);
  if (!partial.length) {
    return null;
  }

  return partial[partial.length - 1];
}

function drawEndpointNode(ctx, point, intensity, unlocked, timeSeed) {
  if (!point) {
    return;
  }

  const pulse = 0.88 + Math.sin(branchVisualTime * 0.0026 + timeSeed) * 0.08;
  const glow = unlocked ? 18 : 10;
  const alpha = unlocked ? 0.82 : 0.38 + intensity * 0.2;
  const radius = unlocked ? 5.8 : 4.1 + intensity * 0.6;

  ctx.save();
  ctx.fillStyle = `rgba(114, 240, 255, ${alpha * 0.28})`;
  ctx.shadowColor = `rgba(114, 240, 255, ${alpha})`;
  ctx.shadowBlur = glow * pulse;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 1.8 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(220, 255, 255, ${alpha})`;
  ctx.shadowBlur = glow * 0.6;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawImpulse(ctx, path, progress, pulseConfig, intensity) {
  if (progress <= 0.06) {
    return;
  }

  const visibleProgress = Math.max(0.04, progress);
  const motion = (branchVisualTime * pulseConfig.speed * 0.00045 + pulseConfig.seed) % 1;
  const pulseProgress = visibleProgress * motion;
  const point = getPointAtProgress(path, pulseProgress);
  if (!point) {
    return;
  }

  const alpha = 0.2 + intensity * 0.45;
  const radius = pulseConfig.size + intensity * 0.65;

  ctx.save();
  ctx.fillStyle = `rgba(225, 255, 255, ${alpha})`;
  ctx.shadowColor = `rgba(114, 240, 255, ${0.55 + intensity * 0.25})`;
  ctx.shadowBlur = 12 + intensity * 6;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPartialPath(ctx, path, progress, twigs = [], pulseOffsets = [], branchSeed = 0) {
  const partialPoints = getPartialBranchPoints(path, progress);
  if (partialPoints.length < 2) {
    return null;
  }

  const branchLife = Math.max(0, Math.min(progress, 1));
  const branchStability = Math.pow(branchLife, 0.78);
  const flicker = 0.96 + Math.sin(branchVisualTime * 0.0032 + branchSeed) * (0.08 * (1 - branchStability));
  const outerAlpha = 0.08 + branchStability * 0.14;
  const mainAlpha = 0.2 + branchStability * 0.42;
  const innerAlpha = 0.36 + branchStability * 0.54;

  drawTaperedStroke(ctx, partialPoints, 13 * flicker, 3.4, `rgba(114, 240, 255, ${outerAlpha})`, 20);
  drawTaperedStroke(ctx, partialPoints, 6.8 * flicker, 2.1, `rgba(114, 240, 255, ${mainAlpha})`, 8);
  drawTaperedStroke(ctx, partialPoints, 2.8, 1, `rgba(230, 255, 255, ${innerAlpha})`, 4);

  const revealedSegments = partialPoints.length - 1;
  for (const twig of twigs) {
    if (twig.anchorIndex <= revealedSegments) {
      drawTwig(ctx, twig, `rgba(140, 245, 255, ${0.12 + branchStability * 0.14})`, 6);
      drawTwig(ctx, twig, `rgba(230, 255, 255, ${0.18 + branchStability * 0.24})`, 2);
    }
  }

  const tip = partialPoints[partialPoints.length - 1];
  const unlocked = progress >= 1;
  drawEndpointNode(ctx, path[path.length - 1], branchStability, unlocked, branchSeed);
  drawEndpointNode(ctx, tip, branchStability, false, branchSeed + 0.7);

  for (const pulseConfig of pulseOffsets) {
    drawImpulse(ctx, path, progress, pulseConfig, branchStability);
  }

  return tip;
}

function renderRoots() {
  if (rootCtx && rootCanvas) {
    rootCtx.clearRect(0, 0, rootCanvas.width, rootCanvas.height);
  }
}

function tickBranchVisuals(now) {
  branchVisualTime = now;
  if (introCompleted) {
    renderEnvironment();
  }
  if (introCompleted && window.innerWidth > 980) {
    renderRoots();
  }
  branchAnimationFrame = requestAnimationFrame(tickBranchVisuals);
}

function getBrainClickPosition(event) {
  const zoneRect = brainZone.getBoundingClientRect();
  const clickX = event && typeof event.clientX === "number"
    ? event.clientX - zoneRect.left
    : zoneRect.width / 2;
  const clickY = event && typeof event.clientY === "number"
    ? event.clientY - zoneRect.top
    : zoneRect.height / 2;

  return { x: clickX, y: clickY };
}

function ripple(event) {
  const { x, y } = getBrainClickPosition(event);
  const node = document.createElement("div");
  node.className = "ripple";
  node.style.left = x + "px";
  node.style.top = y + "px";
  brainZone.appendChild(node);
  setTimeout(() => node.remove(), 620);
}

function brainFlash(event) {
  const { x, y } = getBrainClickPosition(event);
  const node = document.createElement("div");
  node.className = "brain-flash";
  node.style.left = x + "px";
  node.style.top = y + "px";
  brainZone.appendChild(node);
  setTimeout(() => node.remove(), 420);
}

function chargedBurst(event, intensity) {
  const { x, y } = getBrainClickPosition(event);
  const burst = document.createElement("div");
  burst.className = "charge-burst";
  burst.style.left = x + "px";
  burst.style.top = y + "px";
  burst.style.width = 34 + intensity * 26 + "px";
  burst.style.height = 34 + intensity * 26 + "px";
  burst.style.animationDuration = 0.34 + intensity * 0.18 + "s";

  const wave = document.createElement("div");
  wave.className = "charge-wave";
  wave.style.left = x + "px";
  wave.style.top = y + "px";
  wave.style.width = 30 + intensity * 38 + "px";
  wave.style.height = 30 + intensity * 38 + "px";
  wave.style.animationDuration = 0.44 + intensity * 0.24 + "s";

  brainZone.appendChild(wave);
  brainZone.appendChild(burst);
  setTimeout(() => wave.remove(), 760);
  setTimeout(() => burst.remove(), 620);
}

function setBrainCompression(scale, duration, easing) {
  clearTimeout(brainReleaseTimer);
  brainCurrentCompression = scale;
  brain.style.transition = `transform ${duration}ms ${easing}`;
  brain.style.transform = `scale(${scale})`;
}

function setBrainHoldEnergy(value) {
  brainZone.style.setProperty("--hold-energy", value.toFixed(3));
}

function getMinimumCompression(delta) {
  if (delta < 95) {
    return 0.994;
  }
  if (delta < 180) {
    return 0.991;
  }
  if (delta < 320) {
    return 0.988;
  }
  return 0.984;
}

function getMaximumCompression(delta) {
  if (delta < 95) {
    return 0.976;
  }
  if (delta < 180) {
    return 0.958;
  }
  if (delta < 320) {
    return 0.944;
  }
  return 0.932;
}

function stopBrainPressAnimation() {
  if (brainPressAnimationFrame) {
    cancelAnimationFrame(brainPressAnimationFrame);
    brainPressAnimationFrame = 0;
  }
}

function tickBrainHoldCompression() {
  if (!brainIsPressed) {
    return;
  }

  const elapsed = performance.now() - brainHoldStartAt;
  brainHoldProgress = Math.max(0, Math.min(elapsed / 1000, 1));
  const eased = 1 - Math.pow(1 - brainHoldProgress, 2.2);
  const scale = brainMinCompression + (brainMaxCompression - brainMinCompression) * eased;

  brain.style.transition = "transform 0.032s linear";
  brain.style.transform = `scale(${scale})`;
  brainCurrentCompression = scale;
  setBrainHoldEnergy(brainHoldProgress);

  brainPressAnimationFrame = requestAnimationFrame(tickBrainHoldCompression);
}

function beginBrainPress(pointerId) {
  const now = performance.now();
  const delta = lastBrainClickAt ? now - lastBrainClickAt : 999;
  lastBrainClickAt = now;
  brainIsPressed = true;
  activeBrainPointerId = pointerId;
  brainHoldStartAt = now;
  brainHoldProgress = 0;
  brainMinCompression = getMinimumCompression(delta);
  brainMaxCompression = getMaximumCompression(delta);

  clearTimeout(brainHoldTimer);
  stopBrainPressAnimation();
  setBrainCompression(brainMinCompression, 24, "linear");
  setBrainHoldEnergy(0);

  brainHoldTimer = setTimeout(() => {
    if (!brainIsPressed) {
      return;
    }
    stopBrainPressAnimation();
    brainPressAnimationFrame = requestAnimationFrame(tickBrainHoldCompression);
  }, 40);
}

function releaseBrainPress(pointerId) {
  if (!brainIsPressed) {
    return;
  }
  if (pointerId !== undefined && activeBrainPointerId !== null && pointerId !== activeBrainPointerId) {
    return;
  }

  const releasedHoldProgress = brainHoldProgress;
  brainIsPressed = false;
  activeBrainPointerId = null;
  clearTimeout(brainHoldTimer);
  stopBrainPressAnimation();
  brainHoldProgress = 0;
  setBrainCompression(1, 130, "cubic-bezier(0.22, 1, 0.36, 1)");
  setBrainHoldEnergy(0);

  brainReleaseTimer = setTimeout(() => {
    brain.style.transition = "transform 0.06s linear";
  }, 140);

  return releasedHoldProgress;
}

function getChargedBonus(progress) {
  if (progress < 0.12) {
    return 0;
  }

  return Math.round(game.clickPower * (progress * progress * 3));
}

function applyChargedImpulse(event, holdProgress) {
  const bonus = getChargedBonus(holdProgress);
  if (bonus <= 0) {
    return;
  }

  game.impulses += bonus;
  game.maxImpulses = Math.max(game.maxImpulses || 0, game.impulses);
  chargedBurst(event, holdProgress);
  floatingValue(bonus, event);
  render();
  queueSave();
}

function floatingValue(amount, event) {
  const node = document.createElement("div");
  const { x: clickX, y: clickY } = getBrainClickPosition(event);

  node.className = "float-number";
  node.textContent = "+" + formatNumber(amount);
  node.style.left = clickX + "px";
  node.style.top = clickY + "px";
  brainZone.appendChild(node);
  setTimeout(() => node.remove(), 900);
}

function hideHintIfNeeded() {
  const shouldShowHint = introCompleted && game.totalClicks === 0;
  hint.classList.toggle("hidden", !shouldShowHint);
}

function render() {
  recalculateStats();
  renderStats();
  updateBrainVisual();
  updateDormancyVisual();
  updateAtmosphere();
  hideHintIfNeeded();
  renderUpgrades();
  renderRoots();
  renderEnvironment();
}

function clickBrain(event) {
  event.preventDefault();
  game.impulses += game.clickPower;
  game.maxImpulses = Math.max(game.maxImpulses || 0, game.impulses);
  game.totalClicks += 1;
  spawnBackgroundPulse(event);
  brainFlash(event);
  ripple(event);
  floatingValue(game.clickPower, event);
  render();
  queueSave();
}

function buyUpgrade(upgradeId) {
  const upgrade = upgrades.find((item) => item.id === upgradeId);
  if (!upgrade) {
    return;
  }

  if (game.maxImpulses < upgrade.unlockAt) {
    return;
  }

  const cost = getCost(upgrade);
  if (game.impulses < cost) {
    return;
  }

  game.impulses -= cost;
  getUpgradeState(upgrade.id).owned += 1;
  render();
  queueSave();
}

function resetGame() {
  Object.assign(game, cloneState(defaultState));
  activatedRoots = new Set();
  currentBrainStage = -1;
  brainIsPressed = false;
  activeBrainPointerId = null;
  clearTimeout(brainHoldTimer);
  clearTimeout(brainReleaseTimer);
  stopBrainPressAnimation();
  setBrainHoldEnergy(0);
  brain.style.transform = "scale(1)";
  brain.style.transition = "transform 0.06s linear";
  clearTimeout(brainFadeTimer);
  lastAutoTick = performance.now();
  localStorage.removeItem(SAVE_KEY);
  clearTimeout(saveTimer);
  saveTimer = null;
  lastSavedAt = 0;
  clearLinkLayer();
  render();
  statusText.textContent = "Progressi azzerati.";
}

function handleAutoTick(now) {
  const elapsed = (now - lastAutoTick) / 1000;

  if (elapsed >= 1) {
    if (game.autoPower > 0) {
      game.impulses += game.autoPower * elapsed;
      game.maxImpulses = Math.max(game.maxImpulses || 0, game.impulses);
      render();
      queueSave();
    }
    lastAutoTick = now;
  }

  requestAnimationFrame(handleAutoTick);
}

brain.addEventListener("pointerdown", (event) => {
  beginBrainPress(event.pointerId);
  if (typeof brain.setPointerCapture === "function") {
    brain.setPointerCapture(event.pointerId);
  }
  clickBrain(event);
});
brain.addEventListener("pointerup", (event) => {
  const holdProgress = releaseBrainPress(event.pointerId);
  applyChargedImpulse(event, holdProgress || 0);
});
brain.addEventListener("pointercancel", (event) => {
  releaseBrainPress(event.pointerId);
});
brain.addEventListener("lostpointercapture", (event) => {
  releaseBrainPress(event.pointerId);
});
introButton.addEventListener("click", advanceIntro);

upgradeField.addEventListener("click", (event) => {
  const nodeElement = event.target.closest(".synapse-node");
  if (!nodeElement) {
    return;
  }

  const upgradeId = nodeElement.dataset.upgradeId;
  if (!upgradeId) {
    return;
  }

  buyUpgrade(upgradeId);
  nodeElement.classList.remove("clicked");
  void nodeElement.offsetWidth;
  nodeElement.classList.add("clicked");
});

upgradeField.addEventListener("pointermove", (event) => {
  const nodeElement = event.target.closest(".synapse-node");
  if (!nodeElement) {
    synapseTooltip.classList.remove("visible");
    activeTooltipNodeId = null;
    return;
  }

  const nodeData = getFixedUpgradeSpheres().find((item) => item.id === nodeElement.dataset.nodeId);
  if (!nodeData) {
    return;
  }

  showSynapseTooltip(nodeData);
});

upgradeField.addEventListener("pointerleave", () => {
  synapseTooltip.classList.remove("visible");
  activeTooltipNodeId = null;
});

resetBtn.addEventListener("click", resetGame);

window.addEventListener("resize", () => {
  clearLinkLayer();
  render();
});

renderIntroStep();
render();
branchAnimationFrame = requestAnimationFrame(tickBranchVisuals);
requestAnimationFrame(handleAutoTick);

