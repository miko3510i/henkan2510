const mermaid = window.mermaid;
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 16,
    useMaxWidth: false,
    wrap: true
  }
});

const diagramTypeInputs = document.querySelectorAll('input[name="diagramType"]');
const diagramInput = document.getElementById('diagramInput');
const renderBtn = document.getElementById('renderBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const exportSvgBtn = document.getElementById('exportSvgBtn');
const statusMessage = document.getElementById('statusMessage');
const diagramOutput = document.getElementById('diagramOutput');

let currentType = 'graphviz';
let currentSvg = null;
let lastSource = '';
let lastType = currentType;
let vizInstance = null;
const VIZ_WORKER_URL = 'vendor/full.render.js';
const AUTO_RENDER_DELAY = 400;

let renderTimer = null;
let activeRenderToken = 0;

function ensureViz() {
  if (!vizInstance) {
    vizInstance = new window.Viz({ workerURL: VIZ_WORKER_URL });
  }
  return vizInstance;
}

diagramTypeInputs.forEach((input) => {
  input.addEventListener('change', (event) => {
    currentType = event.target.value;
    statusMessage.textContent = '';
    scheduleRender(true);
  });
});

diagramInput.addEventListener('input', () => {
  scheduleRender();
});

renderBtn.addEventListener('click', () => {
  renderDiagram({ trigger: 'manual' });
});

exportPngBtn.addEventListener('click', async () => {
  if (!currentSvg) return;
  try {
    await exportSvgAsPng(currentSvg, buildFilename('diagram', 'png'));
    statusMessage.textContent = 'PNG を保存しました。';
  } catch (error) {
    console.error(error);
    statusMessage.textContent = `PNG 出力に失敗しました: ${error.message}`;
  }
});

exportSvgBtn.addEventListener('click', () => {
  if (!currentSvg) return;
  try {
    exportSvg(currentSvg, buildFilename('diagram', 'svg'));
    statusMessage.textContent = 'SVG を保存しました。';
  } catch (error) {
    console.error(error);
    statusMessage.textContent = `SVG 出力に失敗しました: ${error.message}`;
  }
});

function toggleExportButtons(enabled) {
  exportPngBtn.disabled = !enabled;
  exportSvgBtn.disabled = !enabled;
}

function setLoading(isLoading, { updateButton = true } = {}) {
  if (updateButton) {
    renderBtn.disabled = isLoading;
    renderBtn.textContent = isLoading ? '描画中…' : '描画';
  }
}

function scheduleRender(immediate = false) {
  if (renderTimer) {
    clearTimeout(renderTimer);
  }
  const delay = immediate ? 0 : AUTO_RENDER_DELAY;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderDiagram({ trigger: 'auto' });
  }, delay);
}

async function renderDiagram({ trigger = 'manual' } = {}) {
  const source = diagramInput.value.trim();
  const updateButton = trigger === 'manual';

  if (updateButton && renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }

  if (!source) {
    lastSource = '';
    lastType = undefined;
    clearOutput('入力が空です。Mermaid または DOT を貼り付けてください。');
    return;
  }

  if (trigger !== 'manual' && source === lastSource && currentType === lastType) {
    return;
  }

  const renderToken = ++activeRenderToken;
  statusMessage.textContent = '描画中…';
  setLoading(true, { updateButton });

  try {
    let svgElement;
    if (currentType === 'mermaid') {
      svgElement = await renderMermaid(source);
    } else {
      svgElement = await renderGraphviz(source);
    }

    if (renderToken !== activeRenderToken) {
      return;
    }

    replaceSvg(svgElement);
    lastSource = source;
    lastType = currentType;
    statusMessage.textContent = '描画しました。PNG・SVG を保存できます。';
    toggleExportButtons(true);
  } catch (error) {
    if (renderToken === activeRenderToken) {
      console.error(error);
      clearOutput(`描画に失敗しました: ${error.message}`);
    }
  } finally {
    setLoading(false, { updateButton });
  }
}

function clearOutput(message) {
  diagramOutput.innerHTML = '';
  currentSvg = null;
  toggleExportButtons(false);
  if (typeof message === 'string') {
    statusMessage.textContent = message;
  }
}

async function renderMermaid(source) {
  // Validate before rendering to provide clearer error messaging
  if (typeof mermaid.parse === 'function') {
    await mermaid.parse(source);
  }
  const uniqueId = `mermaid-${Date.now()}`;
  const { svg } = await mermaid.render(uniqueId, source);
  const container = document.createElement('div');
  container.innerHTML = svg;
  const svgElement = container.querySelector('svg');
  if (!svgElement) {
    throw new Error('Mermaid の SVG 出力を取得できませんでした。');
  }
  normalizeSvg(svgElement);
  // Ensure nodes have padding if missing
  svgElement.querySelectorAll('g.node rect, g.node polygon, g.node path').forEach((shape) => {
    shape.setAttribute('rx', shape.getAttribute('rx') || '6');
    shape.setAttribute('ry', shape.getAttribute('ry') || '6');
  });
  return svgElement;
}

async function renderGraphviz(source) {
  try {
    const viz = ensureViz();
    const svgElement = await viz.renderSVGElement(source);
    normalizeSvg(svgElement);
    return svgElement;
  } catch (error) {
    // Reset instance after failure to avoid stale worker
    vizInstance = null;
    throw error;
  }
}

function replaceSvg(svgElement) {
  diagramOutput.innerHTML = '';
  diagramOutput.appendChild(svgElement);
  currentSvg = svgElement;
  currentSvg.setAttribute('data-diagram-type', currentType);
}

function normalizeSvg(svgElement) {
  ensureViewBox(svgElement);
  svgElement.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  svgElement.style.maxWidth = 'none';
  svgElement.style.height = 'auto';
  svgElement.style.width = 'auto';
  svgElement.querySelectorAll('text').forEach((textNode) => {
    textNode.setAttribute('xml:space', 'preserve');
  });
}

async function exportSvgAsPng(svgElement, filename) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(url);
    if (image.decode) {
      try {
        await image.decode();
      } catch (e) {
        // ignore decode failures, fallback to onload-rendered image
      }
    }
    const svgDims = getSvgDimensions(svgElement);
    const naturalWidth = image.width || svgDims.width;
    const naturalHeight = image.height || svgDims.height;
    const scale = calculateScale(naturalWidth, naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(naturalWidth * scale);
    canvas.height = Math.ceil(naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(image, 0, 0, naturalWidth, naturalHeight);
    const pngUrl = canvas.toDataURL('image/png');
    downloadDataUrl(pngUrl, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getSvgDimensions(svgElement) {
  const viewBox = svgElement.viewBox && svgElement.viewBox.baseVal;
  if (viewBox && viewBox.width && viewBox.height) {
    return {
      x: viewBox.x,
      y: viewBox.y,
      width: viewBox.width,
      height: viewBox.height
    };
  }

  const bbox = svgElement.getBBox();
  const width = bbox.width || toNumber(svgElement.getAttribute('width')) || svgElement.clientWidth || 1280;
  const height = bbox.height || toNumber(svgElement.getAttribute('height')) || svgElement.clientHeight || 720;
  return { x: bbox.x || 0, y: bbox.y || 0, width, height };
}

function calculateScale(width, height) {
  const longerSide = Math.max(width, height);
  if (longerSide >= 1600) return 1.5;
  if (longerSide >= 1000) return 2;
  return 3;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG を画像に変換できませんでした。'));
    image.src = url;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename, true);
}

function downloadDataUrl(url, filename, revokeAfter = false) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (revokeAfter) {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function buildFilename(prefix, extension) {
  const stamp = new Date().toISOString().replace(/[:-]/g, '').split('.')[0];
  return `${prefix}-${stamp}.${extension}`;
}

function exportSvg(svgElement, filename) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const blob = new Blob([
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<!-- Generated by NotebookLM Diagram Visualizer -->\n',
    svgString
  ], { type: 'image/svg+xml;charset=utf-8;' });
  downloadBlob(blob, filename);
}

function ensureViewBox(svgElement) {
  const hasViewBox = svgElement.getAttribute('viewBox');
  if (hasViewBox) return;
  try {
    const bbox = svgElement.getBBox();
    if (bbox && bbox.width && bbox.height) {
      svgElement.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    }
  } catch (error) {
    // If getBBox fails (e.g., SVG hidden), fall back later when dimensions are computed
  }
}

function toNumber(value) {
  if (!value) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
