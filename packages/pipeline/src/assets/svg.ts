import type { AssetManifestEntry } from './types.js';
import { SVG_RENDERER_TYPES } from './types.js';

export function isAllowedRendererType(type: string): boolean {
  return (SVG_RENDERER_TYPES as readonly string[]).includes(type);
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function svgWrapper(
  content: string,
  width: number,
  height: number,
  title: string,
  desc: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  <title>${esc(title)}</title>\n  <desc>${esc(desc)}</desc>\n${content}\n</svg>`;
}

export function renderSvg(entry: AssetManifestEntry): string {
  const { rendererType, parameters, altText, caption } = entry;
  const title = altText;
  const desc = caption || '';

  switch (rendererType) {
    case 'place-value-chart': {
      const maxPlaces = (parameters as any).maxPlaces || 4;
      const num = (parameters as any).number;
      const digits =
        num !== undefined
          ? String(num).padStart(maxPlaces, '0').split('')
          : Array(maxPlaces).fill('0');
      const placeNames = [
        'Ones',
        'Tens',
        'Hundreds',
        'Thousands',
        'Ten Thousands',
        'Lakhs',
        'Ten Lakhs',
        'Crores',
        'Ten Crores',
      ];
      const cw = 90,
        ch = 44,
        hh = 28,
        w = maxPlaces * cw,
        h = ch + hh + 24;
      let c = '';
      for (let i = 0; i < maxPlaces; i++) {
        const x = i * cw;
        const pi = maxPlaces - 1 - i;
        c += `<rect x="${x}" y="${hh}" width="${cw}" height="${ch}" fill="#f0f4f8" stroke="#64748b" stroke-width="1"/>\n`;
        c += `<text x="${x + cw / 2}" y="${hh - 7}" text-anchor="middle" font-size="11" fill="#475569">${esc(placeNames[pi] || '')}</text>\n`;
        c += `<text x="${x + cw / 2}" y="${hh + ch / 2 + 5}" text-anchor="middle" font-size="16" font-weight="bold" fill="#1e293b">${esc(digits[i] || '')}</text>\n`;
      }
      return svgWrapper(c, w, h, title, desc);
    }
    case 'number-line': {
      const min = (parameters as any).min || 0,
        max = (parameters as any).max || 10,
        target = (parameters as any).target,
        markers = (parameters as any).markers;
      const pad = 60,
        w = 600,
        h = 120,
        ly = h / 2,
        ls = pad,
        le = w - pad,
        range = max - min;
      let c = `<line x1="${ls}" y1="${ly}" x2="${le}" y2="${ly}" stroke="#1e293b" stroke-width="2"/>\n`;
      const ti = range <= 10 ? 1 : range <= 20 ? 2 : 5;
      for (let v = min; v <= max; v += ti) {
        const x = ls + ((v - min) / range) * (le - ls);
        c += `<line x1="${x}" y1="${ly - 8}" x2="${x}" y2="${ly + 8}" stroke="#1e293b" stroke-width="1.5"/>\n`;
        c += `<text x="${x}" y="${ly + 22}" text-anchor="middle" font-size="11" fill="#475569">${v}</text>\n`;
      }
      if (target != null && target >= min && target <= max) {
        const tx = ls + ((target - min) / range) * (le - ls);
        c += `<circle cx="${tx}" cy="${ly}" r="6" fill="#ef4444"/>\n`;
      }
      if (markers)
        for (const m of markers)
          if (m >= min && m <= max) {
            const mx = ls + ((m - min) / range) * (le - ls);
            c += `<circle cx="${mx}" cy="${ly}" r="4" fill="#3b82f6"/>\n`;
          }
      return svgWrapper(c, w, h, title, desc);
    }
    case 'fraction-bar': {
      const num = (parameters as any).numerator,
        den = (parameters as any).denominator;
      const bw = 500,
        bh = 40,
        pad = 50,
        w = bw + 2 * pad,
        h = 120;
      let c = '';
      for (let i = 0; i < den; i++) {
        const x = pad + i * (bw / den);
        c += `<rect x="${x}" y="40" width="${bw / den}" height="${bh}" fill="${i < num ? '#3b82f6' : '#e2e8f0'}" stroke="#64748b" stroke-width="1"/>\n`;
      }
      c += `<rect x="${pad}" y="40" width="${bw}" height="${bh}" fill="none" stroke="#1e293b" stroke-width="2"/>\n`;
      c += `<text x="${w / 2}" y="30" text-anchor="middle" font-size="14" fill="#1e293b" font-weight="bold">${num}/${den}</text>\n`;
      return svgWrapper(c, w, h, title, desc);
    }
    case 'fraction-circle': {
      const num = (parameters as any).numerator,
        den = (parameters as any).denominator;
      const cx = 100,
        cy = 100,
        r = 80,
        w = 220,
        h = 240;
      let c = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e2e8f0" stroke="#1e293b" stroke-width="2"/>\n`;
      const sa = 360 / den;
      for (let i = 0; i < num; i++) {
        const a1 = ((i * sa - 90) * Math.PI) / 180,
          a2 = (((i + 1) * sa - 90) * Math.PI) / 180;
        const x1 = cx + r * Math.cos(a1),
          y1 = cy + r * Math.sin(a1),
          x2 = cx + r * Math.cos(a2),
          y2 = cy + r * Math.sin(a2);
        c += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sa > 180 ? 1 : 0} 1 ${x2},${y2} Z" fill="#3b82f6" stroke="#1e293b" stroke-width="1"/>\n`;
      }
      c += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="18" fill="#1e293b" font-weight="bold">${num}/${den}</text>\n`;
      return svgWrapper(c, w, h, title, desc);
    }
    case 'decimal-grid': {
      const w = (parameters as any).whole || 0,
        t = (parameters as any).tenths || 0,
        hd = (parameters as any).hundredths || 0;
      const cs = 24,
        cols = 10,
        rows = 10,
        pad = 40,
        tw = cols * cs + 2 * pad,
        th = rows * cs + 2 * pad + 60;
      let c = '';
      const filled = t * 10 + hd;
      for (let r = 0; r < rows; r++)
        for (let col = 0; col < cols; col++) {
          const idx = r * cols + col;
          c += `<rect x="${pad + col * cs}" y="${pad + r * cs}" width="${cs}" height="${cs}" fill="${idx < filled ? '#3b82f6' : '#f8fafc'}" stroke="#cbd5e1" stroke-width="0.5"/>\n`;
        }
      c += `<rect x="${pad}" y="${pad}" width="${cols * cs}" height="${rows * cs}" fill="none" stroke="#1e293b" stroke-width="2"/>\n`;
      c += `<text x="${tw / 2}" y="${pad + rows * cs + 30}" text-anchor="middle" font-size="14" fill="#1e293b" font-weight="bold">${w}.${t}${hd}</text>\n`;
      return svgWrapper(c, tw, th, title, desc);
    }
    case 'measurement-scale': {
      const min = (parameters as any).min || 0,
        max = (parameters as any).max || 10,
        step = (parameters as any).step || 1,
        unit = (parameters as any).unit || '';
      const uw = 60,
        pad = 40,
        w = (max - min) * uw + 2 * pad,
        h = 100,
        sy = 40;
      let c = `<line x1="${pad}" y1="${sy}" x2="${w - pad}" y2="${sy}" stroke="#1e293b" stroke-width="2"/>\n`;
      for (let v = min; v <= max; v += step) {
        const x = pad + (v - min) * uw,
          major = v % (step * 5) === 0;
        c += `<line x1="${x}" y1="${sy}" x2="${x}" y2="${sy + (major ? 15 : v % (step * 2) === 0 ? 10 : 5)}" stroke="#1e293b" stroke-width="1"/>\n`;
        if (major || v === min || v === max)
          c += `<text x="${x}" y="${sy + 28}" text-anchor="middle" font-size="11" fill="#475569">${v} ${unit}</text>\n`;
      }
      return svgWrapper(c, w, h, title, desc);
    }
    case 'area-grid':
    case 'perimeter-grid': {
      const rows = (parameters as any).rows || 1,
        cols = (parameters as any).cols || 1,
        cs = (parameters as any).cellSize || 30;
      const shaded = new Set(((parameters as any).shadedCells || []) as number[]);
      const pad = 40,
        w = cols * cs + 2 * pad,
        h = rows * cs + 2 * pad;
      let c = '';
      for (let r = 0; r < rows; r++)
        for (let col = 0; col < cols; col++) {
          const idx = r * cols + col;
          c += `<rect x="${pad + col * cs}" y="${pad + r * cs}" width="${cs}" height="${cs}" fill="${shaded.has(idx) ? '#3b82f6' : '#f8fafc'}" stroke="${rendererType === 'perimeter-grid' ? '#ef4444' : '#cbd5e1'}" stroke-width="0.5"/>\n`;
        }
      c += `<rect x="${pad}" y="${pad}" width="${cols * cs}" height="${rows * cs}" fill="none" stroke="#1e293b" stroke-width="2"/>\n`;
      if (rendererType === 'perimeter-grid')
        c += `<rect x="${pad}" y="${pad}" width="${cols * cs}" height="${rows * cs}" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,3"/>\n`;
      return svgWrapper(c, w, h, title, desc);
    }
    case 'geometry-basic': {
      const type = (parameters as any).type,
        sw = 300,
        sh = 260;
      let c = '';
      if (type === 'square') {
        const s = (parameters as any).side || 100;
        c += `<rect x="${(sw - s) / 2}" y="${(sh - s) / 2}" width="${s}" height="${s}" fill="#dbeafe" stroke="#1e293b" stroke-width="2"/>\n`;
      } else if (type === 'rectangle') {
        const rw = (parameters as any).width || 140,
          rh = (parameters as any).height || 80;
        c += `<rect x="${(sw - rw) / 2}" y="${(sh - rh) / 2}" width="${rw}" height="${rh}" fill="#dbeafe" stroke="#1e293b" stroke-width="2"/>\n`;
      } else if (type === 'triangle') {
        const b = (parameters as any).base || 120,
          th = (parameters as any).triangleHeight || 80;
        c += `<polygon points="${(sw - b) / 2},${sh - 40} ${(sw + b) / 2},${sh - 40} ${sw / 2},${sh - 40 - th}" fill="#dbeafe" stroke="#1e293b" stroke-width="2"/>\n`;
      } else if (type === 'circle') {
        const r = (parameters as any).radius || 60;
        c += `<circle cx="${sw / 2}" cy="${sh / 2}" r="${r}" fill="#dbeafe" stroke="#1e293b" stroke-width="2"/>\n`;
      }
      return svgWrapper(c, sw, sh, title, desc);
    }
    case 'bar-chart': {
      const labels = (parameters as any).labels || [],
        values = (parameters as any).values || [];
      const bw = 50,
        bg = 20,
        pad = 60,
        ch = 200,
        w = labels.length * (bw + bg) + bg + 2 * pad,
        h = ch + 2 * pad + 40,
        maxV = Math.max(...values, 1);
      let c = `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${pad + ch}" stroke="#1e293b" stroke-width="2"/>\n`;
      c += `<line x1="${pad}" y1="${pad + ch}" x2="${w - pad}" y2="${pad + ch}" stroke="#1e293b" stroke-width="2"/>\n`;
      for (let i = 0; i < labels.length; i++) {
        const bh = (values[i] / maxV) * ch,
          x = pad + bg + i * (bw + bg),
          y = pad + ch - bh;
        c += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="#3b82f6" stroke="#1e293b" stroke-width="1"/>\n`;
        c += `<text x="${x + bw / 2}" y="${pad + ch + 16}" text-anchor="middle" font-size="10" fill="#475569">${esc(labels[i])}</text>\n`;
      }
      return svgWrapper(c, w, h, title, desc);
    }
    case 'pictograph': {
      const labels = (parameters as any).labels || [],
        values = (parameters as any).values || [];
      const isz = 24,
        ipr = 10,
        pad = 80,
        rh = 30,
        w = ipr * isz + 2 * pad,
        h = labels.length * rh + 2 * pad + 40;
      let c = '';
      for (let i = 0; i < labels.length; i++) {
        const y = pad + i * rh;
        c += `<text x="${pad - 8}" y="${y + 16}" text-anchor="end" font-size="11" fill="#475569">${esc(labels[i])}</text>\n`;
        for (let j = 0; j < values[i]; j++)
          c += `<circle cx="${pad + j * isz + isz / 2}" cy="${y + isz / 2}" r="8" fill="#3b82f6" stroke="#1e293b" stroke-width="0.5"/>\n`;
      }
      return svgWrapper(c, w, h, title, desc);
    }
    default:
      throw new Error(`Unknown renderer type: ${rendererType}`);
  }
}
