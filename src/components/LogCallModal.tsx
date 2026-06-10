'use client';

import { useState } from 'react';
import { X, Phone } from 'lucide-react';

type Props = {
  contactName: string;
  onSave: (notes: string) => void;
  onClose: () => void;
};

export function LogCallModal({ contactName, onSave, onClose }: Props) {
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-elevated border border-edge rounded-lg w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif text-base font-light flex items-center gap-2">
            <Phone size={14} className="text-accent" /> Log Call
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary transition-colors cursor-pointer"><X size={16} /></button>
        </div>
        <p className="text-xs text-secondary">Log a completed call with <span className="text-primary">{contactName}</span></p>
        <div>
          <label className="block text-[10px] text-secondary mb-1">What did you discuss?</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Quick notes from the call..."
            className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none resize-y transition-colors"
            autoFocus
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-edge px-3 py-2 text-xs text-secondary hover:text-primary transition-colors cursor-pointer">Cancel</button>
          <button
            type="button"
            onClick={() => onSave(notes.trim())}
            className="flex-1 rounded-md bg-accent px-3 py-2 text-xs text-white hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Log Call
          </button>
        </div>
      </div>
    </div>
  );
}
