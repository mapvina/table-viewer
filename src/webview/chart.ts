export interface ChartItem {
  label: string;
  value: number;
}

export type ChartType = 'bar' | 'horizontal-bar' | 'line' | 'pie' | 'donut';

interface HitArea {
  type: 'rect' | 'circle' | 'arc';
  // rect
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  // circle
  cx?: number;
  cy?: number;
  r?: number;
  // arc (pie/donut)
  innerR?: number;
  outerR?: number;
  startAngle?: number;
  endAngle?: number;
  // metadata
  label: string;
  value: number;
  formatted: string;
  pct?: string;
}

export class ChartRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tooltipEl: HTMLElement | null;

  private hitAreas: HitArea[] = [];
  private hoveredIndex = -1;

  private colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#eab308', '#a855f7', '#0ea5e9', '#64748b'
  ];

  // Cached state for re-rendering on hover
  private lastType: ChartType = 'bar';
  private lastLabels: string[] = [];
  private lastValues: number[] = [];
  private lastXTitle = '';
  private lastYTitle = '';

  constructor(canvas: HTMLCanvasElement, tooltipEl?: HTMLElement | null) {
    this.canvas = canvas;
    this.tooltipEl = tooltipEl || document.getElementById('chart-tooltip');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = ctx;

    this.attachMouseEvents();
  }

  private attachMouseEvents(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let found: HitArea | null = null;
      let foundIdx = -1;

      for (let i = 0; i < this.hitAreas.length; i++) {
        const h = this.hitAreas[i];
        if (h.type === 'rect') {
          if (
            mouseX >= (h.x || 0) &&
            mouseX <= (h.x || 0) + (h.w || 0) &&
            mouseY >= (h.y || 0) &&
            mouseY <= (h.y || 0) + (h.h || 0)
          ) {
            found = h;
            foundIdx = i;
            break;
          }
        } else if (h.type === 'circle') {
          const dx = mouseX - (h.cx || 0);
          const dy = mouseY - (h.cy || 0);
          if (dx * dx + dy * dy <= (h.r || 6) * (h.r || 6) + 40) {
            found = h;
            foundIdx = i;
            break;
          }
        } else if (h.type === 'arc') {
          const dx = mouseX - (h.cx || 0);
          const dy = mouseY - (h.cy || 0);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= (h.innerR || 0) && dist <= (h.outerR || 0)) {
            let angle = Math.atan2(dy, dx);
            if (angle < -Math.PI / 2) {
              angle += Math.PI * 2;
            }
            let s = h.startAngle || 0;
            let end = h.endAngle || 0;
            if (angle >= s && angle <= end) {
              found = h;
              foundIdx = i;
              break;
            }
          }
        }
      }

      if (found && this.tooltipEl) {
        this.canvas.style.cursor = 'pointer';
        let tipHtml = `<strong>${escapeHtml(found.label)}</strong><br/>Value: <b>${found.formatted}</b>`;
        if (found.pct) {
          tipHtml += ` (${found.pct})`;
        }
        this.tooltipEl.innerHTML = tipHtml;
        this.tooltipEl.style.display = 'block';

        // Position tooltip
        const containerRect = this.canvas.parentElement?.getBoundingClientRect() || rect;
        const left = Math.min(e.clientX - containerRect.left + 14, containerRect.width - 150);
        const top = Math.max(e.clientY - containerRect.top - 40, 10);
        this.tooltipEl.style.left = `${left}px`;
        this.tooltipEl.style.top = `${top}px`;
      } else {
        this.canvas.style.cursor = 'default';
        if (this.tooltipEl) {
          this.tooltipEl.style.display = 'none';
        }
      }

      if (foundIdx !== this.hoveredIndex) {
        this.hoveredIndex = foundIdx;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.canvas.style.cursor = 'default';
      this.hoveredIndex = -1;
      if (this.tooltipEl) {
        this.tooltipEl.style.display = 'none';
      }
    });
  }

  public render(
    type: ChartType,
    labels: string[],
    values: number[],
    xTitle: string,
    yTitle: string
  ): void {
    this.lastType = type;
    this.lastLabels = labels;
    this.lastValues = values;
    this.lastXTitle = xTitle;
    this.lastYTitle = yTitle;
    this.hitAreas = [];

    // Auto-fit canvas to container width with HiDPI support
    const container = this.canvas.parentElement;
    const cssWidth = container ? Math.max(container.clientWidth - 20, 400) : 700;
    const cssHeight = 380;
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = cssWidth * dpr;
    this.canvas.height = cssHeight * dpr;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (labels.length === 0 || values.length === 0) {
      this.ctx.fillStyle = '#888';
      this.ctx.font = '14px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('No data available to display chart', cssWidth / 2, cssHeight / 2);
      return;
    }

    switch (type) {
      case 'horizontal-bar':
        this.renderHorizontalBar(cssWidth, cssHeight, labels, values, xTitle, yTitle);
        break;
      case 'line':
        this.renderLineChart(cssWidth, cssHeight, labels, values, xTitle, yTitle);
        break;
      case 'pie':
        this.renderPieOrDonut(cssWidth, cssHeight, labels, values, false);
        break;
      case 'donut':
        this.renderPieOrDonut(cssWidth, cssHeight, labels, values, true);
        break;
      case 'bar':
      default:
        this.renderVerticalBar(cssWidth, cssHeight, labels, values, xTitle, yTitle);
        break;
    }
  }

  private renderVerticalBar(
    width: number,
    height: number,
    labels: string[],
    values: number[],
    xTitle: string,
    yTitle: string
  ): void {
    const ctx = this.ctx;
    const padLeft = 65;
    const padRight = 30;
    const padTop = 35;
    const padBottom = 75;

    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;

    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);

    // Provide baseline zero if appropriate
    if (minVal > 0) minVal = 0;
    if (maxVal < 0) maxVal = 0;
    if (minVal === maxVal) {
      maxVal = minVal + 1;
    }
    // Headroom 10%
    const span = maxVal - minVal;
    maxVal += span * 0.08;
    const range = (maxVal - minVal) || 1;

    // Y position of 0
    const zeroY = padTop + ((maxVal - 0) / range) * chartHeight;

    // Draw grid lines
    const ticks = 5;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= ticks; i++) {
      const val = minVal + (range / ticks) * (ticks - i);
      const y = padTop + (chartHeight / ticks) * i;

      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      ctx.fillStyle = '#888888';
      ctx.fillText(formatNumberShort(val), padLeft - 8, y + 4);
    }

    // Zero baseline
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroY);
    ctx.lineTo(width - padRight, zeroY);
    ctx.stroke();

    // Bars
    const barCount = values.length;
    const slotWidth = chartWidth / barCount;
    const barWidth = Math.max(Math.min(slotWidth * 0.65, 45), 6);

    for (let i = 0; i < barCount; i++) {
      const val = values[i];
      const valY = padTop + ((maxVal - val) / range) * chartHeight;
      const x = padLeft + i * slotWidth + (slotWidth - barWidth) / 2;

      let y = Math.min(valY, zeroY);
      let h = Math.abs(valY - zeroY);
      if (h < 2) h = 2; // minimum visible height

      const color = this.colors[i % this.colors.length];
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth, h);

      // Record hit area for tooltips
      this.hitAreas.push({
        type: 'rect',
        x,
        y,
        w: barWidth,
        h,
        label: labels[i],
        value: val,
        formatted: formatNumber(val)
      });

      // Top value text
      if (barWidth > 18) {
        ctx.fillStyle = '#cccccc';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const labelY = val >= 0 ? y - 4 : y + h + 12;
        ctx.fillText(formatNumberShort(val), x + barWidth / 2, labelY);
      }

      // X Axis Label (rotated)
      ctx.save();
      ctx.translate(x + barWidth / 2, height - padBottom + 12);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '11px sans-serif';
      const labelText = labels[i].length > 14 ? labels[i].slice(0, 12) + '…' : labels[i];
      ctx.fillText(labelText, 0, 0);
      ctx.restore();
    }

    // Y Axis Title
    if (yTitle) {
      ctx.save();
      ctx.translate(16, padTop + chartHeight / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '11px sans-serif';
      ctx.fillText(yTitle, 0, 0);
      ctx.restore();
    }
  }

  private renderHorizontalBar(
    width: number,
    height: number,
    labels: string[],
    values: number[],
    xTitle: string,
    yTitle: string
  ): void {
    const ctx = this.ctx;
    const padLeft = 120;
    const padRight = 60;
    const padTop = 30;
    const padBottom = 40;

    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;

    let minVal = Math.min(...values, 0);
    let maxVal = Math.max(...values, 0) * 1.08;
    const range = (maxVal - minVal) || 1;

    const zeroX = padLeft + ((0 - minVal) / range) * chartWidth;

    // Draw Vertical Grid Lines
    const ticks = 5;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= ticks; i++) {
      const val = minVal + (range / ticks) * i;
      const x = padLeft + (chartWidth / ticks) * i;

      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, height - padBottom);
      ctx.stroke();

      ctx.fillStyle = '#888888';
      ctx.fillText(formatNumberShort(val), x, height - padBottom + 15);
    }

    // Zero baseline
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(zeroX, padTop);
    ctx.lineTo(zeroX, height - padBottom);
    ctx.stroke();

    const barCount = values.length;
    const slotHeight = chartHeight / barCount;
    const barHeight = Math.max(Math.min(slotHeight * 0.65, 24), 6);

    for (let i = 0; i < barCount; i++) {
      const val = values[i];
      const valX = padLeft + ((val - minVal) / range) * chartWidth;
      const y = padTop + i * slotHeight + (slotHeight - barHeight) / 2;

      const x = Math.min(zeroX, valX);
      const w = Math.max(Math.abs(valX - zeroX), 2);

      const color = this.colors[i % this.colors.length];
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, barHeight);

      // Hit area
      this.hitAreas.push({
        type: 'rect',
        x,
        y,
        w,
        h: barHeight,
        label: labels[i],
        value: val,
        formatted: formatNumber(val)
      });

      // Value label on right of bar
      ctx.fillStyle = '#cccccc';
      ctx.font = '10px sans-serif';
      ctx.textAlign = val >= 0 ? 'left' : 'right';
      const labelX = val >= 0 ? x + w + 5 : x - 5;
      ctx.fillText(formatNumberShort(val), labelX, y + barHeight / 2 + 3);

      // Category label on left
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      const cleanLabel = labels[i].length > 15 ? labels[i].slice(0, 13) + '…' : labels[i];
      ctx.fillText(cleanLabel, padLeft - 8, y + barHeight / 2 + 4);
    }
  }

  private renderLineChart(
    width: number,
    height: number,
    labels: string[],
    values: number[],
    xTitle: string,
    yTitle: string
  ): void {
    const ctx = this.ctx;
    const padLeft = 65;
    const padRight = 30;
    const padTop = 35;
    const padBottom = 75;

    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;

    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (minVal > 0) minVal = 0;
    if (minVal === maxVal) maxVal += 1;
    maxVal += (maxVal - minVal) * 0.08;
    const range = (maxVal - minVal) || 1;

    // Grid lines
    const ticks = 5;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= ticks; i++) {
      const val = minVal + (range / ticks) * (ticks - i);
      const y = padTop + (chartHeight / ticks) * i;

      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      ctx.fillStyle = '#888888';
      ctx.fillText(formatNumberShort(val), padLeft - 8, y + 4);
    }

    const count = values.length;
    const step = count > 1 ? chartWidth / (count - 1) : chartWidth / 2;

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const x = padLeft + i * step;
      const y = padTop + ((maxVal - values[i]) / range) * chartHeight;
      points.push({ x, y });
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padBottom);
    for (const pt of points) ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(points[points.length - 1].x, height - padBottom);
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Points & Labels
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const val = values[i];

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Hit area
      this.hitAreas.push({
        type: 'circle',
        cx: pt.x,
        cy: pt.y,
        r: 8,
        label: labels[i],
        value: val,
        formatted: formatNumber(val)
      });

      // Label below
      ctx.save();
      ctx.translate(pt.x, height - padBottom + 12);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '11px sans-serif';
      const labelText = labels[i].length > 14 ? labels[i].slice(0, 12) + '…' : labels[i];
      ctx.fillText(labelText, 0, 0);
      ctx.restore();
    }
  }

  private renderPieOrDonut(
    width: number,
    height: number,
    labels: string[],
    values: number[],
    isDonut: boolean
  ): void {
    const ctx = this.ctx;
    const total = values.reduce((a, b) => a + Math.max(0, b), 0);
    if (total === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('All values are zero or negative for Pie chart', width / 2, height / 2);
      return;
    }

    const centerX = width * 0.38;
    const centerY = height * 0.5;
    const outerR = Math.min(centerX, centerY) * 0.82;
    const innerR = isDonut ? outerR * 0.55 : 0;

    let startAngle = -Math.PI / 2;

    for (let i = 0; i < values.length; i++) {
      const val = Math.max(0, values[i]);
      if (val === 0) continue;

      const sliceAngle = (val / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const color = this.colors[i % this.colors.length];

      ctx.beginPath();
      if (isDonut) {
        ctx.arc(centerX, centerY, outerR, startAngle, endAngle);
        ctx.arc(centerX, centerY, innerR, endAngle, startAngle, true);
      } else {
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, outerR, startAngle, endAngle);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#1e1e1e';
      ctx.lineWidth = 2;
      ctx.stroke();

      const pctStr = `${((val / total) * 100).toFixed(1)}%`;

      this.hitAreas.push({
        type: 'arc',
        cx: centerX,
        cy: centerY,
        innerR,
        outerR,
        startAngle,
        endAngle,
        label: labels[i],
        value: val,
        formatted: formatNumber(val),
        pct: pctStr
      });

      startAngle = endAngle;
    }

    // Donut center label
    if (isDonut) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatNumberShort(total), centerX, centerY + 2);
      ctx.fillStyle = '#888888';
      ctx.font = '10px sans-serif';
      ctx.fillText('TOTAL', centerX, centerY + 18);
    }

    // Legend on the right side
    const legendX = width * 0.68;
    let legendY = 35;
    const maxLegendItems = Math.min(values.length, 12);
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';

    for (let i = 0; i < maxLegendItems; i++) {
      const color = this.colors[i % this.colors.length];
      const val = Math.max(0, values[i]);
      const pct = ((val / total) * 100).toFixed(1);

      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY - 9, 11, 11);

      ctx.fillStyle = '#cccccc';
      const labelText = labels[i].length > 18 ? labels[i].slice(0, 16) + '…' : labels[i];
      ctx.fillText(`${labelText} (${pct}%)`, legendX + 16, legendY);

      legendY += 24;
    }

    if (values.length > maxLegendItems) {
      ctx.fillStyle = '#888888';
      ctx.fillText(`+ ${values.length - maxLegendItems} more items...`, legendX + 16, legendY);
    }
  }
}

function formatNumber(num: number): string {
  return Number.isInteger(num) ? num.toLocaleString() : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatNumberShort(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (abs >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (abs >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return formatNumber(num);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
