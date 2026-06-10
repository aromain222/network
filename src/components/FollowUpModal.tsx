'use client';

import { useState } from 'react';
import { X, Copy, Check, Send } from 'lucide-react';

type Props = {
  contactName: string;
  onMarkSent: () => void;
  onClose: () => void;
};

export function FollowUpModal({ contactName, onMarkSent, onClose }: Props) {
  const defaultMessage = `Hey ${contactName.split(' ')[0]}, really appreciated the time today. Learned a lot from our conversation and would love to stay in touch as I figure out my path. Thanks again!`;
  const [message, setMessage] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-elevated border border-edge rounded-lg w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif text-base font-light">Post-Call Follow-Up</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary transition-colors cursor-pointer"><X size={16} /></button>
        </div>
        <p className="text-xs text-secondary">Draft a follow-up message for <span className="text-primary">{contactName}</span></p>
        <div>
          <label className="block text-[10px] text-secondary mb-1">Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-edge bg-bg px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent focus:outline-none resize-y transition-colors"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-edge px-3 py-2 text-xs text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            {copied ? <><Check size={12} className="text-green" /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
          <button
            type="button"
            onClick={onMarkSent}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs text-white hover:bg-accent/90 transition-colors cursor-pointer"
          >
            <Send size={12} /> Mark as Sent
          </button>
        </div>
      </div>
    </div>
  );
}
