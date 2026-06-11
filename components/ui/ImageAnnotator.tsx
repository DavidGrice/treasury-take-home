"use client";
import React, { useRef, useState, useImperativeHandle, forwardRef } from "react";

type Box = { id: string; x: number; y: number; w: number; h: number };

const ImageAnnotator = forwardRef(function ImageAnnotator({
  src,
  onRecognize,
}: {
  src: string;
  onRecognize?: (blob: Blob, box: Box) => void;
}, ref) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [drawing, setDrawing] = useState<null | { sx: number; sy: number }>(null);
  const [tempBox, setTempBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState<null | { id: string; ox: number; oy: number }>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const relPos = (clientX: number, clientY: number) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;
    const p = relPos(e.clientX, e.clientY);
    setDrawing({ sx: p.x, sy: p.y });
    setTempBox({ id: 'temp', x: p.x, y: p.y, w: 0, h: 0 });
    setSelectedId('temp');
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const p = relPos(e.clientX, e.clientY);
    const sx = drawing.sx;
    const sy = drawing.sy;
    const x = Math.min(sx, p.x);
    const y = Math.min(sy, p.y);
    const w = Math.abs(p.x - sx);
    const h = Math.abs(p.y - sy);
    setTempBox({ id: 'temp', x, y, w, h });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!drawing) return;
    if (tempBox && tempBox.w > 5 && tempBox.h > 5) {
      const id = `box_${Date.now()}`;
      setBoxes((s) => [...s, { ...tempBox, id }]);
      setSelectedId(id);
    }
    setDrawing(null);
    setTempBox(null);
  };

  const startDrag = (e: React.MouseEvent, box: Box) => {
    e.stopPropagation();
    const p = relPos(e.clientX, e.clientY);
    setDragging({ id: box.id, ox: p.x - box.x, oy: p.y - box.y });
    setSelectedId(box.id);
  };

  const onOverlayMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const p = relPos(e.clientX, e.clientY);
    setBoxes((s) => s.map((b) => (b.id === dragging.id ? { ...b, x: p.x - dragging.ox, y: p.y - dragging.oy } : b)));
  };

  const endDrag = () => setDragging(null);

  const cropBoxToBlob = async (box: Box) => {
    if (!imgRef.current) return null;
    const img = imgRef.current;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const rect = overlayRef.current!.getBoundingClientRect();
    const displayW = rect.width;
    const displayH = rect.height;
    const scaleX = naturalW / displayW;
    const scaleY = naturalH / displayH;
    const sx = Math.max(0, box.x * scaleX);
    const sy = Math.max(0, box.y * scaleY);
    const sw = Math.min(naturalW - sx, box.w * scaleX);
    const sh = Math.min(naturalH - sy, box.h * scaleY);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    return new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
  };

  useImperativeHandle(ref, () => ({
    async getSelectedBoxBlob() {
      if (!selectedId) return null;
      const box = boxes.find((b) => b.id === selectedId);
      if (!box) return null;
      return await cropBoxToBlob(box);
    },
    getSelectedBox() {
      return boxes.find((b) => b.id === selectedId) || null;
    }
    ,
    clearBoxes() {
      setBoxes([]);
      setSelectedId(null);
    }
  }));

  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ maxWidth: 640, position: 'relative' }}>
        <img ref={imgRef} src={src} alt="annotate" draggable={false} style={{ width: '100%', display: 'block' }} />
        <div
          ref={overlayRef}
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none' }}
        >
          {boxes.map((b) => (
            <div
              key={b.id}
              onMouseDown={(e) => startDrag(e, b)}
              onClick={(e) => { e.stopPropagation(); setSelectedId(b.id); }}
              style={{
                position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h,
                border: `2px solid ${selectedId === b.id ? '#0b5fff' : '#ffb400'}`,
                boxSizing: 'border-box', cursor: 'move', background: 'rgba(255,255,255,0.02)'
              }}
            />
          ))}
          {tempBox && (
            <div style={{ position: 'absolute', left: tempBox.x, top: tempBox.y, width: tempBox.w, height: tempBox.h, border: '2px dashed #0b5fff' }} />
          )}
        </div>
      </div>

      
    </div>
  );
});

export default ImageAnnotator;
